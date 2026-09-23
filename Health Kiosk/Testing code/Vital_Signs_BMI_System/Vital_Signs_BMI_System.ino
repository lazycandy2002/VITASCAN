/* =======================================================================
   VITAL SIGNS + BMI SYSTEM  (Arduino Mega)
   =======================================================================
   Flow follows the supplied block diagram:

     Start
       -> Temperature  (sensor startup -> wait -> detect -> received? -> retry/display)
       -> Pulse Rate   (sensor startup -> wait -> detect -> received? -> retry/display)
       -> Oxygen       (sensor startup -> wait -> detect -> received? -> retry/display)
       -> Height       (sensor startup -> wait -> detect -> received? -> retry/display)
       -> Weight       (sensor startup -> wait -> detect -> received? -> retry/display)
       -> Show all data + BMI result
       -> END

   Communication: plain text lines over Serial (USB/UART), 9600 baud.
   Every result is printed as "Label: value" on its own line so the
   React + Vite app can read the raw serial stream and parse it with
   simple string matching (indexOf / split on ":").

   IMPORTANT DESIGN NOTE ON PULSE + OXYGEN:
   The MAX30102 produces heart rate AND SpO2 from the SAME physical
   sample buffer - it cannot measure them separately. To honor the
   diagram (which shows Pulse Rate and Oxygen as two distinct steps)
   while staying hardware-accurate:
     - The "PULSE RATE" step performs the real sensor acquisition and
       reports heart rate. It also caches the SpO2 value it obtained
       for free in the same acquisition.
     - The "OXYGEN" step re-uses that cached SpO2 value (clearly
       reported as such over Serial). If Pulse was skipped/failed, or
       the user chooses to redo Oxygen, a fresh full acquisition is
       triggered automatically.
   ======================================================================= */

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// =====================================================
// SENSORS
// =====================================================

MAX30105 sensor;
Adafruit_MLX90614 mlx;
LiquidCrystal_I2C lcd(0x27, 16, 4);
HX711 scale;

// =====================================================
// MAX30102 SETTINGS
// =====================================================

#define BUFFER_SIZE 100

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2;
int8_t validSpO2;

int32_t heartRate;
int8_t validHeartRate;

#define FINGER_IR_THRESHOLD   20000UL
#define FINGER_RED_THRESHOLD  10000UL

#define MAX_RAW_MIN           5000UL
#define MAX_RAW_MAX           262000UL

#define MIN_VALID_SIGNAL_SAMPLES 50

// Saturation / excessive-pressure protection (was previously defined
// but unused - now wired into the actual saturation checks below).
#define HARD_PRESS_IR_THRESHOLD   220000UL
#define HARD_PRESS_RED_THRESHOLD  180000UL
#define HARD_PRESS_CONFIRM_COUNT  8

// =====================================================
// BPM CALIBRATION
// =====================================================

#define BPM_SCALE  0.1888
#define BPM_OFFSET 63.67

// =====================================================
// HEIGHT SENSOR (HC-SR04 ultrasonic, mounted overhead)
// =====================================================

#define ULTRASONIC_TRIG_PIN 5
#define ULTRASONIC_ECHO_PIN 18

#define FIXED_DISTANCE_CM 200.0

#define ULTRASONIC_MIN_CM 2.0
#define ULTRASONIC_MAX_CM 200.0

#define DISTANCE_SAMPLES 100
#define MIN_VALID_HEIGHT_SAMPLES 50

// =====================================================
// WEIGHT SENSOR (HX711 + load cell)
// =====================================================

#define HX711_DOUT_PIN 6
#define HX711_SCK_PIN  7

// TODO: calibrate for your specific load cell.
// Put a known weight on the platform, read the raw value with
// scale.get_units(10), then set CALIBRATION_FACTOR = raw / known_kg.
#define WEIGHT_CALIBRATION_FACTOR -7050.0

#define WEIGHT_SAMPLES            60
#define MIN_VALID_WEIGHT_SAMPLES  30
#define WEIGHT_FILTER_TOLERANCE_KG 0.5
#define WEIGHT_MIN_KG              2.0
#define WEIGHT_MAX_KG            300.0

// =====================================================
// STANDARD SETUP TIMER
// =====================================================

#define SETUP_TIME_SECONDS 5

// =====================================================
// USER IDENTITY
// =====================================================

String userName = "";
int userAge = 0;
char userGender = ' '; // 'M' or 'F'

// =====================================================
// CACHED VITALS (for the Pulse / Oxygen split)
// =====================================================

bool vitalsCacheValid = false;
int cachedRawHR = 0;
int cachedCorrectedHR = 0;
int cachedSpO2 = 0;

// =====================================================
// FUNCTION DECLARATIONS
// =====================================================

// Low level helpers
String readSerialLineBlocking();
bool   waitForYesNo();
void   waitForStartCommand();
int    waitForAgeInput();
char   waitForGenderInput();
void   waitForEnd();
void   stepSetupTimer();
void   lcdMsg4(const char *l0, const char *l1, const char *l2, const char *l3);
void   printSerialHeader(const char *title);
bool   askReady(const char *serialTitle, const char *lcdLine0, const char *lcdLine1);
bool   askTryAgain();
bool   askRedo();

// Flow steps
bool collectIdentity();
void runTest();

bool measureTemperature(float &finalTemperature);
bool acquireVitals(int &rawHR, int &correctedHR, int &spo2Out);
bool measureHeight(float &distanceOut, float &heightOut);
bool measureWeight(float &weightOut);

int   convertHeartRate(int rawHeartRate);
float calculateBMI(float weightKg, float heightCm);
String bmiCategory(float bmi);

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(9600);
  Wire.begin();

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  lcd.init();
  lcd.backlight();
  lcdMsg4("VITAL SIGNS", "+ BMI SYSTEM", "Initializing...", "");
  delay(1500);

  if (mlx.begin()) {
    Serial.println("Temperature Sensor: CONNECTED");
  } else {
    Serial.println("Temperature Sensor: NOT FOUND");
  }

  if (sensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102: CONNECTED");
    sensor.setup(60, 4, 2, 100, 411, 4096);
    sensor.setPulseAmplitudeRed(0x3F);
    sensor.setPulseAmplitudeIR(0x3F);
  } else {
    Serial.println("MAX30102: NOT FOUND");
  }

  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  if (scale.is_ready()) {
    scale.set_scale(WEIGHT_CALIBRATION_FACTOR);
    scale.tare();
    Serial.println("Load Cell (HX711): CONNECTED");
  } else {
    Serial.println("Load Cell (HX711): NOT FOUND");
  }

  lcdMsg4("SYSTEM READY", "Send START", "to begin", "");

  Serial.println();
  Serial.println("================================");
  Serial.println("   VITAL SIGNS + BMI SYSTEM");
  Serial.println("================================");
  Serial.println("SYSTEM READY");
  Serial.println("Send START to begin.");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
  waitForStartCommand();
  runTest();
}

// =====================================================
// LOW LEVEL SERIAL / LCD HELPERS
// =====================================================

String readSerialLineBlocking() {
  while (true) {
    if (Serial.available()) {
      String line = Serial.readStringUntil('\n');
      line.trim();
      if (line.length() > 0) {
        return line;
      }
    }
  }
}

bool waitForYesNo() {
  while (true) {
    String command = readSerialLineBlocking();
    command.toUpperCase();

    if (command == "Y" || command == "YES") {
      Serial.println("Response: YES");
      return true;
    }
    if (command == "N" || command == "NO") {
      Serial.println("Response: NO");
      return false;
    }
    Serial.println("Please answer Y or N.");
  }
}

void waitForStartCommand() {
  while (true) {
    String command = readSerialLineBlocking();
    command.toUpperCase();
    if (command == "START") {
      Serial.println();
      Serial.println("START COMMAND RECEIVED.");
      return;
    }
  }
}

int waitForAgeInput() {
  while (true) {
    String line = readSerialLineBlocking();
    int age = line.toInt();
    if (age > 0 && age <= 120) {
      return age;
    }
    Serial.println("Invalid age. Send a number between 1 and 120.");
  }
}

char waitForGenderInput() {
  while (true) {
    String line = readSerialLineBlocking();
    line.toUpperCase();
    if (line == "M" || line == "MALE") {
      return 'M';
    }
    if (line == "F" || line == "FEMALE") {
      return 'F';
    }
    Serial.println("Invalid gender. Send M or F.");
  }
}

void waitForEnd() {
  Serial.println();
  Serial.println("Results will remain displayed.");
  Serial.println("Send END when finished.");

  while (true) {
    String command = readSerialLineBlocking();
    command.toUpperCase();
    if (command == "END") {
      Serial.println();
      Serial.println("END COMMAND RECEIVED.");
      return;
    }
    Serial.println("Please send END.");
  }
}

void lcdMsg4(const char *l0, const char *l1, const char *l2, const char *l3) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l0);
  lcd.setCursor(0, 1); lcd.print(l1);
  lcd.setCursor(0, 2); lcd.print(l2);
  lcd.setCursor(0, 3); lcd.print(l3);
}

void printSerialHeader(const char *title) {
  Serial.println();
  Serial.println("================================");
  Serial.println(title);
  Serial.println("================================");
}

void stepSetupTimer() {
  Serial.println();
  Serial.println("Get ready...");
  Serial.println("Please prepare for the measurement.");

  lcdMsg4("GET READY", "Please prepare", "", "");

  for (int i = SETUP_TIME_SECONDS; i >= 1; i--) {
    Serial.print("Starting in ");
    Serial.print(i);
    Serial.println("...");

    lcd.setCursor(0, 3);
    lcd.print("Starting in: ");
    lcd.print(i);
    lcd.print("   ");

    delay(1000);
  }

  Serial.println("STARTING MEASUREMENT.");
  lcd.clear();
}

// Generic "Sensor Startup / Ready?" gate used by every step in the
// diagram. Returns true if the user wants to proceed (Y), false if
// they cancel (N) — a false return should cancel the WHOLE test.
bool askReady(const char *serialTitle, const char *lcdLine0, const char *lcdLine1) {
  printSerialHeader(serialTitle);
  Serial.println("Ready to start? Send Y or N.");
  lcdMsg4(lcdLine0, lcdLine1, "Ready to start?", "Y = Yes  N = No");
  return waitForYesNo();
}

// Generic "Try again?" gate used after a FAILED measurement.
// True = retry the step, False = skip the step and move on.
bool askTryAgain() {
  Serial.println("Try again? Send Y or N.");
  lcd.setCursor(0, 2); lcd.print("Try again?      ");
  lcd.setCursor(0, 3); lcd.print("Y = Yes  N = No ");
  return waitForYesNo();
}

// Generic "Redo?" gate used after a SUCCESSFUL measurement.
// True = redo the step, False = accept the result.
bool askRedo() {
  Serial.println("Redo this step? Send Y or N.");
  lcd.setCursor(0, 3); lcd.print("Redo? Y=Yes N=No");
  return waitForYesNo();
}

// =====================================================
// STEP 0: IDENTITY (NAME / AGE / GENDER)
// =====================================================

bool collectIdentity() {

  // ---- NAME ----
  if (!askReady("STEP 0: NAME", "ENTER NAME", "")) {
    Serial.println("Name entry cancelled.");
    return false;
  }
  Serial.println("Type your name and press Enter.");
  lcdMsg4("ENTER NAME", "Type name in", "serial monitor,", "press Enter");
  userName = readSerialLineBlocking();
  Serial.print("NAME: ");
  Serial.println(userName);

  // ---- AGE ----
  if (!askReady("STEP 0: AGE", "ENTER AGE", "")) {
    Serial.println("Age entry cancelled.");
    return false;
  }
  Serial.println("Type your age (years) and press Enter.");
  lcdMsg4("ENTER AGE", "Type age in", "serial monitor,", "press Enter");
  userAge = waitForAgeInput();
  Serial.print("AGE: ");
  Serial.println(userAge);

  // ---- GENDER ----
  if (!askReady("STEP 0: GENDER", "SELECT GENDER", "")) {
    Serial.println("Gender entry cancelled.");
    return false;
  }
  Serial.println("Send M for Male or F for Female.");
  lcdMsg4("SELECT GENDER", "Send M = Male", "Send F = Female", "");
  userGender = waitForGenderInput();
  Serial.print("GENDER: ");
  Serial.println(userGender == 'M' ? "Male" : "Female");

  return true;
}

// =====================================================
// MAIN TEST SEQUENCE
// =====================================================

void runTest() {

  // ---------------------------------------------------
  // STEP 0: IDENTITY
  // ---------------------------------------------------
  if (!collectIdentity()) {
    lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
    delay(1500);
    return;
  }

  // ---------------------------------------------------
  // STEP 1: TEMPERATURE
  // ---------------------------------------------------

  bool temperatureSuccess = false;
  float finalTemperature = 0;

  while (!temperatureSuccess) {

    if (!askReady("STEP 1: TEMPERATURE", "TEMPERATURE", "")) {
      lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
      delay(1500);
      return;
    }

    stepSetupTimer();
    temperatureSuccess = measureTemperature(finalTemperature);

    if (!temperatureSuccess) {
      lcdMsg4("TEMP INVALID", "No valid reading", "", "");
      if (!askTryAgain()) {
        Serial.println("Step 1 skipped.");
        lcdMsg4("STEP 1 SKIPPED", "", "", "");
        delay(1200);
        break;
      }
    } else {
      lcdMsg4("TEMP COMPLETE", "", "", "");
      lcd.setCursor(0, 1);
      lcd.print("Temp: ");
      lcd.print(finalTemperature, 1);
      lcd.write(223);
      lcd.print("C");

      if (askRedo()) {
        temperatureSuccess = false;
      } else {
        Serial.println("Step 1 accepted.");
      }
    }
  }

  // ---------------------------------------------------
  // STEP 2: PULSE RATE  (real sensor acquisition)
  // ---------------------------------------------------

  int rawHeartRate = 0;
  int finalHeartRate = 0;
  int finalSpO2 = 0;

  bool pulseSuccess = false;

  while (!pulseSuccess) {

    if (!askReady("STEP 2: PULSE RATE", "PULSE RATE", "")) {
      lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
      delay(1500);
      return;
    }

    pulseSuccess = acquireVitals(rawHeartRate, finalHeartRate, finalSpO2);
    if (pulseSuccess) {
      vitalsCacheValid = true;
      cachedRawHR = rawHeartRate;
      cachedCorrectedHR = finalHeartRate;
      cachedSpO2 = finalSpO2;
    }

    if (!pulseSuccess) {
      lcdMsg4("PULSE INVALID", "No valid reading", "", "");
      if (!askTryAgain()) {
        Serial.println("Step 2 skipped.");
        lcdMsg4("STEP 2 SKIPPED", "", "", "");
        delay(1200);
        break;
      }
    } else {
      lcdMsg4("PULSE COMPLETE", "", "", "");
      lcd.setCursor(0, 1);
      lcd.print("HR: ");
      lcd.print(finalHeartRate);
      lcd.print(" BPM");

      if (askRedo()) {
        pulseSuccess = false;
      } else {
        Serial.println("Step 2 accepted.");
      }
    }
  }

  // ---------------------------------------------------
  // STEP 3: OXYGEN (SpO2) — reuses cached data when possible
  // ---------------------------------------------------

  bool oxygenSuccess = false;

  while (!oxygenSuccess) {

    if (!askReady("STEP 3: OXYGEN", "OXYGEN (SpO2)", "")) {
      lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
      delay(1500);
      return;
    }

    if (vitalsCacheValid) {
      Serial.println("Using SpO2 captured during Pulse Rate step.");
      finalSpO2 = cachedSpO2;
      oxygenSuccess = true;
    } else {
      Serial.println("No cached data — running a fresh acquisition.");
      int rawHR2 = 0, corrHR2 = 0, spo2_2 = 0;
      oxygenSuccess = acquireVitals(rawHR2, corrHR2, spo2_2);
      if (oxygenSuccess) {
        rawHeartRate = rawHR2;
        finalHeartRate = corrHR2;
        finalSpO2 = spo2_2;
        vitalsCacheValid = true;
        cachedRawHR = rawHR2;
        cachedCorrectedHR = corrHR2;
        cachedSpO2 = spo2_2;
      }
    }

    if (!oxygenSuccess) {
      lcdMsg4("OXYGEN INVALID", "No valid reading", "", "");
      if (!askTryAgain()) {
        Serial.println("Step 3 skipped.");
        lcdMsg4("STEP 3 SKIPPED", "", "", "");
        delay(1200);
        break;
      }
    } else {
      lcdMsg4("OXYGEN COMPLETE", "", "", "");
      lcd.setCursor(0, 1);
      lcd.print("SpO2: ");
      lcd.print(finalSpO2);
      lcd.print("%");

      if (askRedo()) {
        oxygenSuccess = false;
        vitalsCacheValid = false; // force a fresh acquisition on redo
      } else {
        Serial.println("Step 3 accepted.");
      }
    }
  }

  // ---------------------------------------------------
  // STEP 4: HEIGHT
  // ---------------------------------------------------

  bool heightSuccess = false;
  float measuredDistance = 0;
  float finalHeight = 0;

  while (!heightSuccess) {

    if (!askReady("STEP 4: HEIGHT", "HEIGHT", "")) {
      lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
      delay(1500);
      return;
    }

    Serial.println("Stand under the ultrasonic sensor.");
    Serial.println("Keep your head straight and body still.");
    lcdMsg4("HEIGHT SETUP", "Stand straight", "Keep still", "");

    stepSetupTimer();

    lcdMsg4("MEASURING HEIGHT", "Stay still...", "Collecting data", "Time: 0 sec");
    heightSuccess = measureHeight(measuredDistance, finalHeight);

    if (!heightSuccess) {
      lcdMsg4("HEIGHT INVALID", "No valid reading", "", "");
      if (!askTryAgain()) {
        Serial.println("Step 4 skipped.");
        lcdMsg4("STEP 4 SKIPPED", "", "", "");
        delay(1200);
        break;
      }
    } else {
      lcdMsg4("HEIGHT COMPLETE", "", "", "");
      lcd.setCursor(0, 1);
      lcd.print("Height: ");
      lcd.print(finalHeight, 1);
      lcd.print(" cm");

      if (askRedo()) {
        heightSuccess = false;
      } else {
        Serial.println("Step 4 accepted.");
      }
    }
  }

  // ---------------------------------------------------
  // STEP 5: WEIGHT
  // ---------------------------------------------------

  bool weightSuccess = false;
  float finalWeight = 0;

  while (!weightSuccess) {

    if (!askReady("STEP 5: WEIGHT", "WEIGHT", "")) {
      lcdMsg4("TEST CANCELLED", "Send START", "to begin", "");
      delay(1500);
      return;
    }

    Serial.println("Step onto the scale and stand still.");
    lcdMsg4("WEIGHT SETUP", "Step onto scale", "Stand still", "");

    stepSetupTimer();

    lcdMsg4("MEASURING WEIGHT", "Stay still...", "Collecting data", "Time: 0 sec");
    weightSuccess = measureWeight(finalWeight);

    if (!weightSuccess) {
      lcdMsg4("WEIGHT INVALID", "No valid reading", "", "");
      if (!askTryAgain()) {
        Serial.println("Step 5 skipped.");
        lcdMsg4("STEP 5 SKIPPED", "", "", "");
        delay(1200);
        break;
      }
    } else {
      lcdMsg4("WEIGHT COMPLETE", "", "", "");
      lcd.setCursor(0, 1);
      lcd.print("Weight: ");
      lcd.print(finalWeight, 1);
      lcd.print(" kg");

      if (askRedo()) {
        weightSuccess = false;
      } else {
        Serial.println("Step 5 accepted.");
      }
    }
  }

  // ---------------------------------------------------
  // FINAL RESULTS + BMI
  // ---------------------------------------------------

  float bmi = 0;
  String category = "N/A";
  bool bmiValid = (finalHeight > 0 && finalWeight > 0);

  if (bmiValid) {
    bmi = calculateBMI(finalWeight, finalHeight);
    category = bmiCategory(bmi);
  }

  printSerialHeader("          FINAL RESULTS");

  Serial.print("NAME: ");        Serial.println(userName);
  Serial.print("AGE: ");         Serial.println(userAge);
  Serial.print("GENDER: ");      Serial.println(userGender == 'M' ? "Male" : "Female");

  Serial.print("TEMPERATURE: "); Serial.println(finalTemperature > 0 ? String(finalTemperature, 2) + " C" : "INVALID");
  Serial.print("RAW_BPM: ");     Serial.println(rawHeartRate > 0 ? String(rawHeartRate) : "INVALID");
  Serial.print("CORRECTED_BPM: "); Serial.println(finalHeartRate > 0 ? String(finalHeartRate) : "INVALID");
  Serial.print("SPO2: ");        Serial.println(finalSpO2 > 0 ? String(finalSpO2) + " %" : "INVALID");
  Serial.print("HEIGHT: ");      Serial.println(finalHeight > 0 ? String(finalHeight, 1) + " cm" : "INVALID");
  Serial.print("WEIGHT: ");      Serial.println(finalWeight > 0 ? String(finalWeight, 1) + " kg" : "INVALID");
  Serial.print("BMI: ");         Serial.println(bmiValid ? String(bmi, 1) : "INVALID");
  Serial.print("BMI_CATEGORY: "); Serial.println(bmiValid ? category : "INVALID");

  Serial.println("================================");
  Serial.println("MEASUREMENT COMPLETE");
  Serial.println("================================");

  // ---- LCD: page through the results ----

  lcdMsg4("", "", "", "");
  lcd.setCursor(0, 0); lcd.print(userName.length() > 0 ? userName : "N/A");
  lcd.setCursor(0, 1); lcd.print("Age:"); lcd.print(userAge);
  lcd.print(" ");
  lcd.print(userGender == 'M' ? "M" : "F");
  lcd.setCursor(0, 2);
  lcd.print("Temp:");
  if (finalTemperature > 0) { lcd.print(finalTemperature, 1); lcd.write(223); lcd.print("C"); } else { lcd.print("INVALID"); }
  lcd.setCursor(0, 3);
  lcd.print("HR:");
  if (finalHeartRate > 0) { lcd.print(finalHeartRate); lcd.print("bpm"); } else { lcd.print("INVALID"); }
  delay(3000);

  lcdMsg4("", "", "", "");
  lcd.setCursor(0, 0);
  lcd.print("SpO2:");
  if (finalSpO2 > 0) { lcd.print(finalSpO2); lcd.print("%"); } else { lcd.print("INVALID"); }
  lcd.setCursor(0, 1);
  lcd.print("H:");
  if (finalHeight > 0) { lcd.print(finalHeight, 1); lcd.print("cm"); } else { lcd.print("INVALID"); }
  lcd.setCursor(0, 2);
  lcd.print("W:");
  if (finalWeight > 0) { lcd.print(finalWeight, 1); lcd.print("kg"); } else { lcd.print("INVALID"); }
  lcd.setCursor(0, 3);
  lcd.print("BMI:");
  if (bmiValid) { lcd.print(bmi, 1); lcd.print(" "); lcd.print(category); } else { lcd.print("INVALID"); }

  waitForEnd();

  // ---------------------------------------------------
  // RETURN TO READY
  // ---------------------------------------------------

  vitalsCacheValid = false;

  lcdMsg4("SYSTEM READY", "Send START", "to begin", "");

  Serial.println();
  Serial.println("================================");
  Serial.println("SYSTEM READY");
  Serial.println("Send START to begin.");
}

// =====================================================
// TEMPERATURE MEASUREMENT
// =====================================================

bool measureTemperature(float &finalTemperature) {

  Serial.println();
  Serial.println("STARTING TEMPERATURE MEASUREMENT.");
  lcdMsg4("MEASURING TEMP", "Stay still...", "Collecting data", "Time: 0 sec");

  float temperatureSum = 0;
  int temperatureSamples = 0;

  unsigned long temperatureStart = millis();
  int lastSecond = -1;

  while (millis() - temperatureStart < 5000) {

    float temperature = mlx.readObjectTempC();

    if (temperature > 20 && temperature < 45) {
      temperatureSum += temperature;
      temperatureSamples++;
    }

    int currentSecond = (millis() - temperatureStart) / 1000;
    if (currentSecond != lastSecond) {
      lastSecond = currentSecond;
      Serial.print("Stay still... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(100);
  }

  if (temperatureSamples <= 0) {
    Serial.println("Temperature: INVALID");
    return false;
  }

  finalTemperature = temperatureSum / temperatureSamples;

  Serial.println();
  Serial.println("TEMPERATURE COMPLETE");
  Serial.print("Temperature: ");
  Serial.print(finalTemperature, 2);
  Serial.println(" C");

  delay(1500);
  return true;
}

// =====================================================
// PULSE + SpO2 ACQUISITION (shared by Pulse & Oxygen steps)
// =====================================================

bool acquireVitals(int &rawHR, int &correctedHR, int &spo2Out) {

  // ---- FINGER INSTRUCTIONS ----

  Serial.println();
  Serial.println("Place your finger on the MAX30102.");
  Serial.println("Cover the sensor completely, use light pressure, keep still.");

  lcdMsg4("PLACE FINGER", "Cover sensor", "Detecting finger", "Time: 0 sec");

  while (sensor.available()) {
    sensor.nextSample();
  }

  // ---- AUTOMATIC FINGER DETECTION ----

  Serial.println();
  Serial.println("Checking finger placement...");

  unsigned long checkStart = millis();
  bool fingerDetected = false;
  uint32_t latestIR = 0, latestRed = 0;
  int lastSecond = -1;

  while (millis() - checkStart < 8000) {

    sensor.check();

    while (sensor.available()) {
      latestIR = sensor.getIR();
      latestRed = sensor.getRed();

      if (latestIR >= FINGER_IR_THRESHOLD && latestRed >= FINGER_RED_THRESHOLD) {
        fingerDetected = true;
        sensor.nextSample();
        break;
      }
      sensor.nextSample();
    }

    int currentSecond = (millis() - checkStart) / 1000;
    if (currentSecond != lastSecond) {
      lastSecond = currentSecond;
      Serial.print("Detecting finger... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    if (fingerDetected) break;
    delay(5);
  }

  if (!fingerDetected) {
    Serial.println();
    Serial.println("ERROR: SENSOR TIMEOUT. Finger was not detected.");
    Serial.print("Latest IR: "); Serial.println(latestIR);
    Serial.print("Latest RED: "); Serial.println(latestRed);
    return false;
  }

  Serial.println();
  Serial.println("FINGER DETECTED. Stabilizing signal.");
  lcdMsg4("FINGER DETECTED", "Please wait...", "Keep finger still", "Time: 0 sec");

  // ---- STABILIZATION (with saturation protection) ----

  unsigned long stabilizeStart = millis();
  int stableLastSecond = -1;
  int saturationCount = 0;

  while (millis() - stabilizeStart < 5000) {

    sensor.check();

    while (sensor.available()) {
      uint32_t stabilizeIR = sensor.getIR();
      uint32_t stabilizeRed = sensor.getRed();

      if (stabilizeIR >= HARD_PRESS_IR_THRESHOLD || stabilizeRed >= HARD_PRESS_RED_THRESHOLD) {
        saturationCount++;
      } else {
        saturationCount = 0;
      }

      if (saturationCount >= HARD_PRESS_CONFIRM_COUNT) {
        Serial.println();
        Serial.println("Sensor signal overloaded. Please reduce finger pressure.");
        lcdMsg4("SIGNAL TOO HIGH", "Press more lightly", "Reposition finger", "Measurement bad");
        sensor.nextSample();
        delay(1200);
        return false;
      }

      sensor.nextSample();
    }

    int currentSecond = (millis() - stabilizeStart) / 1000;
    if (currentSecond != stableLastSecond) {
      stableLastSecond = currentSecond;
      Serial.print("Please wait... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(5);
  }

  while (sensor.available()) {
    sensor.nextSample();
  }

  // ---- DATA COLLECTION ----

  Serial.println();
  Serial.println("COLLECTING SENSOR DATA. Please keep your finger still.");
  lcdMsg4("COLLECTING DATA", "Please wait...", "Keep finger still", "Time: 0 sec");

  int sampleCount = 0;
  int validSignalSamples = 0;
  int collectionSaturationCount = 0;

  unsigned long collectionStart = millis();
  int lastCollectionSecond = -1;

  while (sampleCount < BUFFER_SIZE) {

    sensor.check();

    while (sensor.available()) {
      uint32_t redValue = sensor.getRed();
      uint32_t irValue = sensor.getIR();

      if (irValue >= HARD_PRESS_IR_THRESHOLD || redValue >= HARD_PRESS_RED_THRESHOLD) {
        collectionSaturationCount++;
      } else {
        collectionSaturationCount = 0;
      }

      if (collectionSaturationCount >= HARD_PRESS_CONFIRM_COUNT) {
        Serial.println();
        Serial.println("ERROR: SENSOR SIGNAL OVERLOADED. Measurement marked invalid.");
        lcdMsg4("SIGNAL TOO HIGH", "Press more lightly", "Reposition finger", "Measurement bad");
        sensor.nextSample();
        delay(1200);
        return false;
      }

      bool signalPresent = irValue >= FINGER_IR_THRESHOLD && redValue >= FINGER_RED_THRESHOLD;
      bool rawValuePossible = irValue >= MAX_RAW_MIN && redValue >= MAX_RAW_MIN &&
                               irValue <= MAX_RAW_MAX && redValue <= MAX_RAW_MAX;

      if (signalPresent && rawValuePossible) {
        redBuffer[sampleCount] = redValue;
        irBuffer[sampleCount] = irValue;
        validSignalSamples++;
      } else if (sampleCount > 0) {
        redBuffer[sampleCount] = redBuffer[sampleCount - 1];
        irBuffer[sampleCount] = irBuffer[sampleCount - 1];
      } else {
        redBuffer[sampleCount] = redValue;
        irBuffer[sampleCount] = irValue;
      }

      sampleCount++;
      sensor.nextSample();

      if (sampleCount >= BUFFER_SIZE) break;
    }

    int currentCollectionSecond = (millis() - collectionStart) / 1000;
    if (currentCollectionSecond != lastCollectionSecond) {
      lastCollectionSecond = currentCollectionSecond;
      Serial.print("Please wait... Time: ");
      Serial.print(currentCollectionSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentCollectionSecond);
      lcd.print(" sec     ");
    }

    if (millis() - collectionStart > 12000) {
      Serial.println();
      Serial.println("ERROR: SENSOR TIMEOUT.");
      return false;
    }

    delay(2);
  }

  Serial.println();
  Serial.println("Sensor data collection complete.");

  if (validSignalSamples < MIN_VALID_SIGNAL_SAMPLES) {
    Serial.println("ERROR: SIGNAL QUALITY TOO LOW.");
    return false;
  }

  lcdMsg4("DATA COMPLETE", "Calculating...", "Please wait...", "");
  delay(400);

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_SIZE, redBuffer,
    &spo2, &validSpO2, &heartRate, &validHeartRate
  );

  Serial.println();
  Serial.println("RAW SENSOR RESULTS");
  Serial.print("Raw BPM: "); Serial.println(heartRate);
  Serial.print("HR Valid: "); Serial.println(validHeartRate);
  Serial.print("Raw SpO2: "); Serial.println(spo2);
  Serial.print("SpO2 Valid: "); Serial.println(validSpO2);

  if (!validHeartRate || heartRate < 40 || heartRate > 200) {
    Serial.println("RAW HEART RATE INVALID.");
    return false;
  }
  rawHR = heartRate;

  if (!validSpO2 || spo2 < 70 || spo2 > 100) {
    Serial.println("SpO2 RESULT INVALID.");
    return false;
  }

  int corrected = convertHeartRate(heartRate);
  if (corrected < 40 || corrected > 200) {
    Serial.println("CORRECTED BPM INVALID.");
    return false;
  }

  correctedHR = corrected;
  spo2Out = spo2;

  Serial.println();
  Serial.println("CONVERSION");
  Serial.print("Raw BPM: "); Serial.println(heartRate);
  Serial.print("BPM Scale: "); Serial.println(BPM_SCALE, 4);
  Serial.print("BPM Offset: "); Serial.println(BPM_OFFSET, 2);
  Serial.print("Corrected BPM: "); Serial.println(correctedHR);
  Serial.print("SpO2: "); Serial.print(spo2Out); Serial.println("%");

  delay(1500);
  return true;
}

// =====================================================
// BPM CONVERSION
// =====================================================

int convertHeartRate(int rawHeartRate) {
  float corrected = (rawHeartRate * BPM_SCALE) + BPM_OFFSET;
  return round(corrected);
}

// =====================================================
// HEIGHT MEASUREMENT
// =====================================================

bool measureHeight(float &distanceOut, float &heightOut) {

  float distanceSum = 0;
  int validSamples = 0;
  float distanceBuffer[DISTANCE_SAMPLES];

  unsigned long heightStart = millis();
  int lastSecond = -1;

  for (int i = 0; i < DISTANCE_SAMPLES; i++) {

    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

    unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000);

    if (duration != 0) {
      float distance = duration * 0.0343 / 2.0;
      if (distance >= ULTRASONIC_MIN_CM && distance <= ULTRASONIC_MAX_CM) {
        distanceBuffer[validSamples] = distance;
        distanceSum += distance;
        validSamples++;
      }
    }

    int currentSecond = (millis() - heightStart) / 1000;
    if (currentSecond != lastSecond) {
      lastSecond = currentSecond;
      Serial.print("Collecting height... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(60);
  }

  if (validSamples < MIN_VALID_HEIGHT_SAMPLES) {
    Serial.println("Not enough valid height readings.");
    return false;
  }

  float averageDistance = distanceSum / validSamples;

  float filteredSum = 0;
  int filteredCount = 0;
  for (int i = 0; i < validSamples; i++) {
    if (abs(distanceBuffer[i] - averageDistance) <= 5.0) {
      filteredSum += distanceBuffer[i];
      filteredCount++;
    }
  }

  distanceOut = (filteredCount >= 30) ? (filteredSum / filteredCount) : averageDistance;
  heightOut = FIXED_DISTANCE_CM - distanceOut;

  if (heightOut < 0 || heightOut > 198) {
    return false;
  }

  Serial.println();
  Serial.println("HEIGHT CONVERSION");
  Serial.print("Reference distance: "); Serial.print(FIXED_DISTANCE_CM); Serial.println(" cm");
  Serial.print("Measured distance: "); Serial.print(distanceOut, 1); Serial.println(" cm");
  Serial.print("Height: "); Serial.print(heightOut, 1); Serial.println(" cm");
  Serial.print("Valid samples: "); Serial.println(validSamples);
  Serial.print("Filtered samples: "); Serial.println(filteredCount);

  return true;
}

// =====================================================
// WEIGHT MEASUREMENT (HX711 + load cell)
// =====================================================

bool measureWeight(float &weightOut) {

  if (!scale.is_ready()) {
    Serial.println("ERROR: LOAD CELL NOT RESPONDING.");
    return false;
  }

  float weightSum = 0;
  int validSamples = 0;
  float weightBuffer[WEIGHT_SAMPLES];

  unsigned long weightStart = millis();
  int lastSecond = -1;

  for (int i = 0; i < WEIGHT_SAMPLES; i++) {

    if (scale.is_ready()) {
      float w = scale.get_units(1);

      if (w >= WEIGHT_MIN_KG && w <= WEIGHT_MAX_KG) {
        weightBuffer[validSamples] = w;
        weightSum += w;
        validSamples++;
      }
    }

    int currentSecond = (millis() - weightStart) / 1000;
    if (currentSecond != lastSecond) {
      lastSecond = currentSecond;
      Serial.print("Collecting weight... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(80);
  }

  if (validSamples < MIN_VALID_WEIGHT_SAMPLES) {
    Serial.println("Not enough valid weight readings.");
    return false;
  }

  float averageWeight = weightSum / validSamples;

  float filteredSum = 0;
  int filteredCount = 0;
  for (int i = 0; i < validSamples; i++) {
    if (abs(weightBuffer[i] - averageWeight) <= WEIGHT_FILTER_TOLERANCE_KG) {
      filteredSum += weightBuffer[i];
      filteredCount++;
    }
  }

  weightOut = (filteredCount >= (MIN_VALID_WEIGHT_SAMPLES / 2)) ? (filteredSum / filteredCount) : averageWeight;

  if (weightOut < WEIGHT_MIN_KG || weightOut > WEIGHT_MAX_KG) {
    return false;
  }

  Serial.println();
  Serial.println("WEIGHT RESULT");
  Serial.print("Weight: "); Serial.print(weightOut, 1); Serial.println(" kg");
  Serial.print("Valid samples: "); Serial.println(validSamples);
  Serial.print("Filtered samples: "); Serial.println(filteredCount);

  return true;
}

// =====================================================
// BMI
// =====================================================

float calculateBMI(float weightKg, float heightCm) {
  float heightM = heightCm / 100.0;
  return weightKg / (heightM * heightM);
}

String bmiCategory(float bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25.0) return "Normal";
  if (bmi < 30.0) return "Overweight";
  return "Obese";
}