
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <LiquidCrystal_I2C.h>

// =====================================================
// SENSORS
// =====================================================

MAX30105 sensor;
Adafruit_MLX90614 mlx;
LiquidCrystal_I2C lcd(0x27, 16, 4);

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

// =====================================================
// SIGNAL SETTINGS
// =====================================================

#define FINGER_IR_THRESHOLD   20000UL
#define FINGER_RED_THRESHOLD  10000UL

#define MAX_RAW_MIN           5000UL
#define MAX_RAW_MAX           262000UL

#define MIN_VALID_SIGNAL_SAMPLES 50

// =====================================================
// PRESSURE / SATURATION PROTECTION
// =====================================================
//
// If the sensor signal becomes extremely high,
// the finger may be pressing too hard or blocking
// the sensor excessively.
//
// These values can be adjusted if needed.
// =====================================================

#define HARD_PRESS_IR_THRESHOLD   220000UL
#define HARD_PRESS_RED_THRESHOLD  180000UL

#define HARD_PRESS_CONFIRM_COUNT  5

// =====================================================
// BPM CALIBRATION
// =====================================================

#define BPM_SCALE  0.1888
#define BPM_OFFSET 63.67

// =====================================================
// HEIGHT SENSOR
// =====================================================

#define ULTRASONIC_TRIG_PIN 5
#define ULTRASONIC_ECHO_PIN 18

#define FIXED_DISTANCE_CM 200.0

#define ULTRASONIC_MIN_CM 2.0
#define ULTRASONIC_MAX_CM 200.0

#define DISTANCE_SAMPLES 100

// =====================================================
// STANDARD SETUP TIMER
// =====================================================

#define SETUP_TIME_SECONDS 5

// =====================================================
// FUNCTION DECLARATIONS
// =====================================================

void waitForStart();
bool waitForYesNo();
void stepSetupTimer();

void runTest();

bool measureTemperature(float &finalTemperature);

bool measurePulseOximeter(
  int &finalHeartRate,
  int &finalSpO2,
  int &rawHeartRate
);

bool measureHeight(
  float &distanceOut,
  float &heightOut
);

int convertHeartRate(int rawHeartRate);

void waitForEnd();

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
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("VITAL SIGNS");

  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  delay(2000);

  // ---------------------------------------------------
  // MLX90614
  // ---------------------------------------------------

  if (mlx.begin()) {
    Serial.println("Temperature Sensor: CONNECTED");
  } else {
    Serial.println("Temperature Sensor: NOT FOUND");
  }

  // ---------------------------------------------------
  // MAX30102
  // ---------------------------------------------------

  if (sensor.begin(Wire, I2C_SPEED_STANDARD)) {

    Serial.println("MAX30102: CONNECTED");

    sensor.setup(
      60,
      4,
      2,
      100,
      411,
      4096
    );

    sensor.setPulseAmplitudeRed(0x3F);
    sensor.setPulseAmplitudeIR(0x3F);

  } else {

    Serial.println("MAX30102: NOT FOUND");
  }

  // ---------------------------------------------------
  // READY
  // ---------------------------------------------------

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SYSTEM READY");

  lcd.setCursor(0, 1);
  lcd.print("Send START");

  lcd.setCursor(0, 2);
  lcd.print("to begin");

  Serial.println();
  Serial.println("================================");
  Serial.println("       VITAL SIGNS SYSTEM");
  Serial.println("================================");
  Serial.println("SYSTEM READY");
  Serial.println("Send START to begin.");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {

  waitForStart();

  runTest();
}

// =====================================================
// WAIT FOR START
// =====================================================

void waitForStart() {

  while (true) {

    if (Serial.available()) {

      String command =
        Serial.readStringUntil('\n');

      command.trim();
      command.toUpperCase();

      if (command == "START") {

        Serial.println();
        Serial.println("START COMMAND RECEIVED.");

        return;
      }
    }
  }
}

// =====================================================
// YES / NO QUESTION
// =====================================================

bool waitForYesNo() {

  while (true) {

    if (Serial.available()) {

      String command =
        Serial.readStringUntil('\n');

      command.trim();
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
}

// =====================================================
// STANDARDIZED 5 SECOND SETUP TIMER
// =====================================================

void stepSetupTimer() {

  Serial.println();
  Serial.println("Get ready...");
  Serial.println("Please prepare for the measurement.");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("GET READY");

  lcd.setCursor(0, 1);
  lcd.print("Please prepare");

  for (
    int i = SETUP_TIME_SECONDS;
    i >= 1;
    i--
  ) {

    Serial.print("Starting in ");
    Serial.print(i);
    Serial.println("...");

    lcd.setCursor(0, 2);
    lcd.print("Starting in: ");
    lcd.print(i);
    lcd.print("   ");

    delay(1000);
  }

  Serial.println("STARTING MEASUREMENT.");

  lcd.clear();
}

// =====================================================
// WAIT FOR END
// =====================================================

void waitForEnd() {

  Serial.println();
  Serial.println("Results will remain displayed.");
  Serial.println("Send END when finished.");

  while (true) {

    if (Serial.available()) {

      String command =
        Serial.readStringUntil('\n');

      command.trim();
      command.toUpperCase();

      if (command == "END") {

        Serial.println();
        Serial.println("END COMMAND RECEIVED.");

        return;
      }

      Serial.println("Please send END.");
    }
  }
}

// =====================================================
// MAIN TEST
// =====================================================

void runTest() {

  // ===================================================
  // STEP 1: TEMPERATURE
  // ===================================================

  bool temperatureSuccess = false;
  float finalTemperature = 0;

  while (!temperatureSuccess) {

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 1: TEMPERATURE");
    Serial.println("================================");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 1");

    lcd.setCursor(0, 1);
    lcd.print("TEMPERATURE");

    lcd.setCursor(0, 2);
    lcd.print("Ready to start?");

    lcd.setCursor(0, 3);
    lcd.print("Y = Yes N = No");

    Serial.println();
    Serial.println("Ready to start?");
    Serial.println("Send Y or N.");

    bool startTemperature =
      waitForYesNo();

    if (!startTemperature) {

      Serial.println(
        "Temperature measurement cancelled."
      );

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 1 CANCELLED");

      lcd.setCursor(0, 2);
      lcd.print("Send START");

      delay(2000);

      return;
    }

    // 5 SECOND SETUP
    stepSetupTimer();

    // 5 SECOND TEMPERATURE MEASUREMENT
    temperatureSuccess =
      measureTemperature(finalTemperature);

    if (!temperatureSuccess) {

      Serial.println();
      Serial.println(
        "Temperature measurement invalid."
      );

      Serial.println("Redo Step 1?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("TEMP INVALID");

      lcd.setCursor(0, 1);
      lcd.print("Redo Step 1?");

      lcd.setCursor(0, 2);
      lcd.print("Y = Yes");

      lcd.setCursor(0, 3);
      lcd.print("N = No");

      bool redo =
        waitForYesNo();

      if (!redo) {

        Serial.println("Step 1 skipped.");

        lcd.clear();

        lcd.setCursor(0, 0);
        lcd.print("STEP 1 SKIPPED");

        delay(1500);

        break;
      }

      Serial.println("Redoing Step 1...");

    } else {

      Serial.println();
      Serial.println("Redo Step 1?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("TEMP COMPLETE");

      lcd.setCursor(0, 1);
      lcd.print("Temp: ");
      lcd.print(finalTemperature, 1);
      lcd.write(223);
      lcd.print("C");

      lcd.setCursor(0, 2);
      lcd.print("Redo Step 1?");

      lcd.setCursor(0, 3);
      lcd.print("Y=Yes N=No");

      bool redo =
        waitForYesNo();

      if (redo) {

        temperatureSuccess = false;

        Serial.println("Redoing Step 1...");

      } else {

        Serial.println("Step 1 accepted.");
      }
    }
  }

  // ===================================================
  // STEP 2: PULSE + SpO2
  // ===================================================

  int finalHeartRate = 0;
  int finalSpO2 = 0;
  int rawHeartRate = 0;

  bool pulseSuccess = false;

  while (!pulseSuccess) {

    pulseSuccess =
      measurePulseOximeter(
        finalHeartRate,
        finalSpO2,
        rawHeartRate
      );

    if (!pulseSuccess) {

      Serial.println();
      Serial.println(
        "STEP 2 measurement was invalid."
      );

      Serial.println("Redo Step 2?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 2 INVALID");

      lcd.setCursor(0, 1);
      lcd.print("Redo Step 2?");

      lcd.setCursor(0, 2);
      lcd.print("Y = Yes");

      lcd.setCursor(0, 3);
      lcd.print("N = No");

      bool redo =
        waitForYesNo();

      if (!redo) {

        Serial.println("Step 2 skipped.");

        lcd.clear();

        lcd.setCursor(0, 0);
        lcd.print("STEP 2 SKIPPED");

        delay(1500);

        break;
      }

      Serial.println("Redoing Step 2...");

    } else {

      Serial.println();
      Serial.println("Redo Step 2?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("PULSE COMPLETE");

      lcd.setCursor(0, 1);
      lcd.print("HR: ");
      lcd.print(finalHeartRate);
      lcd.print(" BPM");

      lcd.setCursor(0, 2);
      lcd.print("SpO2: ");
      lcd.print(finalSpO2);
      lcd.print("%");

      lcd.setCursor(0, 3);
      lcd.print("Redo? Y=Yes N=No");

      bool redo =
        waitForYesNo();

      if (redo) {

        pulseSuccess = false;

        Serial.println("Redoing Step 2...");

      } else {

        Serial.println("Step 2 accepted.");
      }
    }
  }

  // ===================================================
  // STEP 3: HEIGHT
  // ===================================================

  bool heightSuccess = false;

  float measuredDistance = 0;
  float finalHeight = 0;

  while (!heightSuccess) {

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 3: HEIGHT");
    Serial.println("================================");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 3");

    lcd.setCursor(0, 1);
    lcd.print("HEIGHT");

    lcd.setCursor(0, 2);
    lcd.print("Ready to start?");

    lcd.setCursor(0, 3);
    lcd.print("Y = Yes N = No");

    Serial.println();
    Serial.println("Ready to start?");
    Serial.println("Send Y or N.");

    bool startHeight =
      waitForYesNo();

    if (!startHeight) {

      Serial.println(
        "Height measurement cancelled."
      );

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 3 CANCELLED");

      lcd.setCursor(0, 2);
      lcd.print("Send START");

      delay(2000);

      return;
    }

    // =================================================
    // STANDARD 5 SECOND SETUP
    // =================================================

    Serial.println();
    Serial.println(
      "Stand under the ultrasonic sensor."
    );

    Serial.println(
      "Keep your head straight."
    );

    Serial.println(
      "Keep your body still."
    );

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("HEIGHT SETUP");

    lcd.setCursor(0, 1);
    lcd.print("Stand straight");

    lcd.setCursor(0, 2);
    lcd.print("Keep still");

    lcd.setCursor(0, 3);
    lcd.print("Starting in: 5");

    stepSetupTimer();

    // =================================================
    // HEIGHT MEASUREMENT
    // =================================================

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("MEASURING HEIGHT");

    lcd.setCursor(0, 1);
    lcd.print("Stay still...");

    lcd.setCursor(0, 2);
    lcd.print("Collecting data");

    lcd.setCursor(0, 3);
    lcd.print("Time: 0 sec");

    heightSuccess =
      measureHeight(
        measuredDistance,
        finalHeight
      );

    if (!heightSuccess) {

      Serial.println();
      Serial.println(
        "HEIGHT MEASUREMENT INVALID."
      );

      Serial.println("Redo Step 3?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("HEIGHT INVALID");

      lcd.setCursor(0, 1);
      lcd.print("Redo Step 3?");

      lcd.setCursor(0, 2);
      lcd.print("Y = Yes");

      lcd.setCursor(0, 3);
      lcd.print("N = No");

      bool redo =
        waitForYesNo();

      if (!redo) {

        Serial.println("Step 3 skipped.");

        lcd.clear();

        lcd.setCursor(0, 0);
        lcd.print("STEP 3 SKIPPED");

        delay(1500);

        break;
      }

      Serial.println("Redoing Step 3...");

    } else {

      Serial.println();
      Serial.println("Redo Step 3?");
      Serial.println("Send Y or N.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("HEIGHT COMPLETE");

      lcd.setCursor(0, 1);
      lcd.print("Height:");

      lcd.setCursor(0, 2);
      lcd.print(finalHeight, 1);
      lcd.print(" cm");

      lcd.setCursor(0, 3);
      lcd.print("Redo? Y=Yes N=No");

      bool redo =
        waitForYesNo();

      if (redo) {

        heightSuccess = false;

        Serial.println("Redoing Step 3...");

      } else {

        Serial.println("Step 3 accepted.");
      }
    }
  }

  // ===================================================
  // FINAL RESULTS
  // ===================================================

  Serial.println();
  Serial.println("================================");
  Serial.println("          FINAL RESULTS");
  Serial.println("================================");

  Serial.print("Temperature: ");

  if (finalTemperature > 0) {

    Serial.print(
      finalTemperature,
      2
    );

    Serial.println(" C");

  } else {

    Serial.println("INVALID");
  }

  Serial.print("Raw BPM: ");

  if (rawHeartRate > 0) {

    Serial.println(rawHeartRate);

  } else {

    Serial.println("INVALID");
  }

  Serial.print("Corrected BPM: ");

  if (finalHeartRate > 0) {

    Serial.println(finalHeartRate);

  } else {

    Serial.println("INVALID");
  }

  Serial.print("SpO2: ");

  if (finalSpO2 > 0) {

    Serial.print(finalSpO2);
    Serial.println(" %");

  } else {

    Serial.println("INVALID");
  }

  Serial.print("Height: ");

  if (finalHeight > 0) {

    Serial.print(
      finalHeight,
      1
    );

    Serial.println(" cm");

  } else {

    Serial.println("INVALID");
  }

  Serial.println("================================");
  Serial.println("MEASUREMENT COMPLETE");
  Serial.println("================================");

  // ===================================================
  // FINAL LCD
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("T:");

  if (finalTemperature > 0) {

    lcd.print(
      finalTemperature,
      1
    );

    lcd.write(223);
    lcd.print("C");

  } else {

    lcd.print("INVALID");
  }

  lcd.setCursor(0, 1);
  lcd.print("HR:");

  if (finalHeartRate > 0) {

    lcd.print(finalHeartRate);
    lcd.print(" BPM");

  } else {

    lcd.print("INVALID");
  }

  lcd.setCursor(0, 2);
  lcd.print("SpO2:");

  if (finalSpO2 > 0) {

    lcd.print(finalSpO2);
    lcd.print("%");

  } else {

    lcd.print("INVALID");
  }

  lcd.setCursor(0, 3);
  lcd.print("H:");

  if (finalHeight > 0) {

    lcd.print(
      finalHeight,
      1
    );

    lcd.print("cm");

  } else {

    lcd.print("INVALID");
  }

  waitForEnd();

  // ===================================================
  // RETURN TO READY
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SYSTEM READY");

  lcd.setCursor(0, 1);
  lcd.print("Send START");

  lcd.setCursor(0, 2);
  lcd.print("to begin");

  Serial.println();
  Serial.println("================================");
  Serial.println("SYSTEM READY");
  Serial.println("Send START to begin.");
}

// =====================================================
// TEMPERATURE MEASUREMENT
// =====================================================

bool measureTemperature(
  float &finalTemperature
) {

  Serial.println();
  Serial.println(
    "STARTING TEMPERATURE MEASUREMENT."
  );

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("MEASURING TEMP");

  lcd.setCursor(0, 1);
  lcd.print("Stay still...");

  lcd.setCursor(0, 2);
  lcd.print("Collecting data");

  lcd.setCursor(0, 3);
  lcd.print("Time: 0 sec");

  float temperatureSum = 0;
  int temperatureSamples = 0;

  unsigned long temperatureStart =
    millis();

  int lastSecond = -1;

  while (
    millis() - temperatureStart < 5000
  ) {

    float temperature =
      mlx.readObjectTempC();

    if (
      temperature > 20 &&
      temperature < 45
    ) {

      temperatureSum += temperature;
      temperatureSamples++;
    }

    int currentSecond =
      (
        millis() -
        temperatureStart
      ) / 1000;

    if (
      currentSecond != lastSecond
    ) {

      lastSecond = currentSecond;

      Serial.print("Stay still... Time: ");
      Serial.print(currentSecond);
      Serial.println(" seconds");

      lcd.setCursor(0, 1);
      lcd.print("Stay still...    ");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(100);
  }

  if (temperatureSamples <= 0) {

    Serial.println(
      "Temperature: INVALID"
    );

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("TEMP INVALID");

    lcd.setCursor(0, 2);
    lcd.print("No valid reading");

    return false;
  }

  finalTemperature =
    temperatureSum /
    temperatureSamples;

  Serial.println();
  Serial.println(
    "TEMPERATURE COMPLETE"
  );

  Serial.print("Temperature: ");
  Serial.print(
    finalTemperature,
    2
  );

  Serial.println(" C");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("TEMP COMPLETE");

  lcd.setCursor(0, 1);
  lcd.print("Temperature:");

  lcd.setCursor(0, 2);
  lcd.print(
    finalTemperature,
    2
  );

  lcd.write(223);
  lcd.print("C");

  delay(2000);

  return true;
}
// =====================================================
// PULSE + SpO2 MEASUREMENT
// =====================================================

bool measurePulseOximeter(
  int &finalHeartRate,
  int &finalSpO2,
  int &rawHeartRate
) {

  Serial.println();
  Serial.println("================================");
  Serial.println("STEP 2: PULSE + SpO2");
  Serial.println("================================");

  // ---------------------------------------------------
  // READY QUESTION
  // ---------------------------------------------------

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("STEP 2");

  lcd.setCursor(0, 1);
  lcd.print("PULSE + SpO2");

  lcd.setCursor(0, 2);
  lcd.print("Ready to start?");

  lcd.setCursor(0, 3);
  lcd.print("Y = Yes N = No");

  Serial.println();
  Serial.println("Ready to start Step 2?");
  Serial.println("Send Y or N.");

  bool startPulse = waitForYesNo();

  if (!startPulse) {

    Serial.println("Step 2 cancelled.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 2 CANCELLED");

    return false;
  }

  // ---------------------------------------------------
  // FINGER INSTRUCTIONS
  // ---------------------------------------------------

  Serial.println();
  Serial.println("Place your finger on the MAX30102.");
  Serial.println("Cover the sensor completely.");
  Serial.println("Use light pressure.");
  Serial.println("Keep your finger still.");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("PLACE FINGER");

  lcd.setCursor(0, 1);
  lcd.print("Cover sensor");

  lcd.setCursor(0, 2);
  lcd.print("Detecting finger");

  lcd.setCursor(0, 3);
  lcd.print("Time: 0 sec");

  // ---------------------------------------------------
  // CLEAR OLD SENSOR DATA
  // ---------------------------------------------------

  while (sensor.available()) {
    sensor.nextSample();
  }

  // ---------------------------------------------------
  // AUTOMATIC FINGER DETECTION
  // ---------------------------------------------------

  Serial.println();
  Serial.println("Checking finger placement...");

  unsigned long checkStart = millis();

  bool fingerDetected = false;

  uint32_t latestIR = 0;
  uint32_t latestRed = 0;

  int lastSecond = -1;

  while (millis() - checkStart < 8000) {

    sensor.check();

    while (sensor.available()) {

      latestIR = sensor.getIR();
      latestRed = sensor.getRed();

      // -----------------------------------------------
      // NORMAL FINGER DETECTION
      // -----------------------------------------------

      if (
        latestIR >= FINGER_IR_THRESHOLD &&
        latestRed >= FINGER_RED_THRESHOLD
      ) {

        fingerDetected = true;

        sensor.nextSample();

        break;
      }

      sensor.nextSample();
    }

    // -----------------------------------------------
    // DETECTION TIMER
    // -----------------------------------------------

    int currentSecond =
      (millis() - checkStart) / 1000;

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

    if (fingerDetected) {
      break;
    }

    delay(5);
  }

  // ---------------------------------------------------
  // FINGER NOT DETECTED
  // ---------------------------------------------------

  if (!fingerDetected) {

    Serial.println();
    Serial.println("ERROR: SENSOR TIMEOUT.");
    Serial.println("Finger was not detected.");

    Serial.print("Latest IR: ");
    Serial.println(latestIR);

    Serial.print("Latest RED: ");
    Serial.println(latestRed);

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("SENSOR TIMEOUT");

    lcd.setCursor(0, 1);
    lcd.print("Finger invalid");

    lcd.setCursor(0, 2);
    lcd.print("Please reposition");

    lcd.setCursor(0, 3);
    lcd.print("finger");

    return false;
  }

  // ---------------------------------------------------
  // FINGER DETECTED
  // ---------------------------------------------------

  Serial.println();
  Serial.println("FINGER DETECTED.");
  Serial.println("Stabilizing signal.");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("FINGER DETECTED");

  lcd.setCursor(0, 1);
  lcd.print("Please wait...");

  lcd.setCursor(0, 2);
  lcd.print("Keep finger still");

  lcd.setCursor(0, 3);
  lcd.print("Time: 0 sec");

  // ---------------------------------------------------
  // STABILIZATION
  // ---------------------------------------------------

  unsigned long stabilizeStart = millis();

  int stableLastSecond = -1;

  // Only TRUE saturation is considered abnormal.
  // Normal high readings will NOT trigger this.
  const uint32_t SATURATION_IR = 255000UL;
  const uint32_t SATURATION_RED = 255000UL;

  const int SATURATION_CONFIRM_COUNT = 8;

  int saturationCount = 0;

  while (millis() - stabilizeStart < 5000) {

    sensor.check();

    while (sensor.available()) {

      uint32_t stabilizeIR =
        sensor.getIR();

      uint32_t stabilizeRed =
        sensor.getRed();

      // ---------------------------------------------
      // SATURATION CHECK
      // ---------------------------------------------
      //
      // Do NOT treat ordinary high readings as
      // excessive finger pressure.
      //
      // Only readings very close to MAX30102
      // saturation for several consecutive samples
      // are considered abnormal.
      // ---------------------------------------------

      if (
        stabilizeIR >= SATURATION_IR ||
        stabilizeRed >= SATURATION_RED
      ) {

        saturationCount++;

      } else {

        saturationCount = 0;
      }

      // ---------------------------------------------
      // CONFIRMED SATURATION
      // ---------------------------------------------

      if (
        saturationCount >=
        SATURATION_CONFIRM_COUNT
      ) {

        Serial.println();
        Serial.println(
          "Sensor signal overloaded."
        );

        Serial.println(
          "Please reduce finger pressure."
        );

        lcd.clear();

        lcd.setCursor(0, 0);
        lcd.print("SIGNAL TOO HIGH");

        lcd.setCursor(0, 1);
        lcd.print("Press more lightly");

        lcd.setCursor(0, 2);
        lcd.print("Reposition finger");

        lcd.setCursor(0, 3);
        lcd.print("Measurement bad");

        sensor.nextSample();

        delay(1500);

        return false;
      }

      sensor.nextSample();
    }

    // ---------------------------------------------
    // STABILIZATION TIMER
    // ---------------------------------------------

    int currentSecond =
      (millis() - stabilizeStart) / 1000;

    if (
      currentSecond !=
      stableLastSecond
    ) {

      stableLastSecond =
        currentSecond;

      Serial.print(
        "Please wait... Time: "
      );

      Serial.print(
        currentSecond
      );

      Serial.println(
        " seconds"
      );

      lcd.setCursor(0, 1);
      lcd.print("Please wait...   ");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(5);
  }

  // ---------------------------------------------------
  // CLEAR OLD DATA
  // ---------------------------------------------------

  while (sensor.available()) {
    sensor.nextSample();
  }

  // ---------------------------------------------------
  // DATA COLLECTION
  // ---------------------------------------------------

  Serial.println();
  Serial.println("COLLECTING SENSOR DATA");
  Serial.println("Please keep your finger still.");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("COLLECTING DATA");

  lcd.setCursor(0, 1);
  lcd.print("Please wait...");

  lcd.setCursor(0, 2);
  lcd.print("Keep finger still");

  lcd.setCursor(0, 3);
  lcd.print("Time: 0 sec");

  int sampleCount = 0;
  int validSignalSamples = 0;

  // Same saturation protection during collection
  int collectionSaturationCount = 0;

  unsigned long collectionStart = millis();

  int lastCollectionSecond = -1;

  while (sampleCount < BUFFER_SIZE) {

    sensor.check();

    while (sensor.available()) {

      uint32_t redValue =
        sensor.getRed();

      uint32_t irValue =
        sensor.getIR();

      // ---------------------------------------------
      // SATURATION CHECK
      // ---------------------------------------------

      if (
        irValue >= SATURATION_IR ||
        redValue >= SATURATION_RED
      ) {

        collectionSaturationCount++;

      } else {

        collectionSaturationCount = 0;
      }

      // ---------------------------------------------
      // CONFIRMED OVERLOAD
      // ---------------------------------------------

      if (
        collectionSaturationCount >=
        SATURATION_CONFIRM_COUNT
      ) {

        Serial.println();
        Serial.println(
          "ERROR: SENSOR SIGNAL OVERLOADED."
        );

        Serial.println(
          "Measurement marked invalid."
        );

        lcd.clear();

        lcd.setCursor(0, 0);
        lcd.print("SIGNAL TOO HIGH");

        lcd.setCursor(0, 1);
        lcd.print("Press more lightly");

        lcd.setCursor(0, 2);
        lcd.print("Reposition finger");

        lcd.setCursor(0, 3);
        lcd.print("Measurement bad");

        sensor.nextSample();

        delay(1500);

        return false;
      }

      // ---------------------------------------------
      // SIGNAL CHECK
      // ---------------------------------------------

      bool signalPresent =
        irValue >= FINGER_IR_THRESHOLD &&
        redValue >= FINGER_RED_THRESHOLD;

      bool rawValuePossible =
        irValue >= MAX_RAW_MIN &&
        redValue >= MAX_RAW_MIN &&
        irValue <= MAX_RAW_MAX &&
        redValue <= MAX_RAW_MAX;

      if (
        signalPresent &&
        rawValuePossible
      ) {

        redBuffer[sampleCount] =
          redValue;

        irBuffer[sampleCount] =
          irValue;

        validSignalSamples++;

      } else {

        if (sampleCount > 0) {

          redBuffer[sampleCount] =
            redBuffer[sampleCount - 1];

          irBuffer[sampleCount] =
            irBuffer[sampleCount - 1];

        } else {

          redBuffer[sampleCount] =
            redValue;

          irBuffer[sampleCount] =
            irValue;
        }
      }

      sampleCount++;

      sensor.nextSample();

      if (
        sampleCount >=
        BUFFER_SIZE
      ) {

        break;
      }
    }

    // ---------------------------------------------
    // COLLECTION TIMER
    // ---------------------------------------------

    int currentCollectionSecond =
      (millis() - collectionStart) / 1000;

    if (
      currentCollectionSecond !=
      lastCollectionSecond
    ) {

      lastCollectionSecond =
        currentCollectionSecond;

      Serial.print(
        "Please wait... Time: "
      );

      Serial.print(
        currentCollectionSecond
      );

      Serial.println(
        " seconds"
      );

      lcd.setCursor(0, 3);

      lcd.print("Time: ");
      lcd.print(currentCollectionSecond);
      lcd.print(" sec     ");
    }

    // ---------------------------------------------
    // TIMEOUT
    // ---------------------------------------------

    if (
      millis() -
      collectionStart >
      12000
    ) {

      Serial.println();
      Serial.println(
        "ERROR: SENSOR TIMEOUT."
      );

      return false;
    }

    delay(2);
  }

  // ---------------------------------------------------
  // DATA COLLECTION COMPLETE
  // ---------------------------------------------------

  Serial.println();
  Serial.println(
    "Sensor data collection complete."
  );

  // ---------------------------------------------------
  // SIGNAL QUALITY
  // ---------------------------------------------------

  if (
    validSignalSamples <
    MIN_VALID_SIGNAL_SAMPLES
  ) {

    Serial.println(
      "ERROR: SIGNAL QUALITY TOO LOW."
    );

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("SIGNAL TOO LOW");

    lcd.setCursor(0, 1);
    lcd.print("Measurement");

    lcd.setCursor(0, 2);
    lcd.print("invalid");

    lcd.setCursor(0, 3);
    lcd.print("Please reposition");

    return false;
  }

  // ---------------------------------------------------
  // CALCULATE
  // ---------------------------------------------------

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("DATA COMPLETE");

  lcd.setCursor(0, 1);
  lcd.print("Calculating...");

  lcd.setCursor(0, 2);
  lcd.print("Please wait...");

  delay(500);

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    BUFFER_SIZE,
    redBuffer,
    &spo2,
    &validSpO2,
    &heartRate,
    &validHeartRate
  );

  // ---------------------------------------------------
  // RAW RESULTS
  // ---------------------------------------------------

  Serial.println();
  Serial.println(
    "================================"
  );

  Serial.println(
    "RAW SENSOR RESULTS"
  );

  Serial.println(
    "================================"
  );

  Serial.print("Raw BPM: ");
  Serial.println(heartRate);

  Serial.print("HR Valid: ");
  Serial.println(validHeartRate);

  Serial.print("Raw SpO2: ");
  Serial.println(spo2);

  Serial.print("SpO2 Valid: ");
  Serial.println(validSpO2);

  // ---------------------------------------------------
  // HEART RATE VALIDATION
  // ---------------------------------------------------

  if (
    !validHeartRate ||
    heartRate < 40 ||
    heartRate > 200
  ) {

    Serial.println(
      "RAW HEART RATE INVALID."
    );

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("HR INVALID");

    lcd.setCursor(0, 1);
    lcd.print("Measurement");

    lcd.setCursor(0, 2);
    lcd.print("could not be");

    lcd.setCursor(0, 3);
    lcd.print("calculated");

    return false;
  }

  rawHeartRate =
    heartRate;

  // ---------------------------------------------------
  // SpO2 VALIDATION
  // ---------------------------------------------------

  if (
    !validSpO2 ||
    spo2 < 70 ||
    spo2 > 100
  ) {

    Serial.println(
      "SpO2 RESULT INVALID."
    );

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("SpO2 INVALID");

    lcd.setCursor(0, 1);
    lcd.print("Measurement");

    lcd.setCursor(0, 2);
    lcd.print("could not be");

    lcd.setCursor(0, 3);
    lcd.print("calculated");

    return false;
  }

  // ---------------------------------------------------
  // BPM CONVERSION
  // ---------------------------------------------------

  int correctedHeartRate =
    convertHeartRate(
      heartRate
    );

  if (
    correctedHeartRate < 40 ||
    correctedHeartRate > 200
  ) {

    Serial.println(
      "CORRECTED BPM INVALID."
    );

    return false;
  }

  // ---------------------------------------------------
  // CONVERSION RESULTS
  // ---------------------------------------------------

  Serial.println();
  Serial.println(
    "================================"
  );

  Serial.println(
    "CONVERSION"
  );

  Serial.println(
    "================================"
  );

  Serial.print("Raw BPM: ");
  Serial.println(heartRate);

  Serial.print("BPM Scale: ");
  Serial.println(
    BPM_SCALE,
    4
  );

  Serial.print("BPM Offset: ");
  Serial.println(
    BPM_OFFSET,
    2
  );

  Serial.print("Corrected BPM: ");
  Serial.println(
    correctedHeartRate
  );

  Serial.println();

  Serial.print("SpO2: ");
  Serial.print(spo2);
  Serial.println("%");

  Serial.println(
    "================================"
  );

  // ---------------------------------------------------
  // SAVE RESULTS
  // ---------------------------------------------------

  finalHeartRate =
    correctedHeartRate;

  finalSpO2 =
    spo2;

  // ---------------------------------------------------
  // DISPLAY RESULTS
  // ---------------------------------------------------

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("PULSE COMPLETE");

  lcd.setCursor(0, 1);
  lcd.print("HR: ");
  lcd.print(finalHeartRate);
  lcd.print(" BPM");

  lcd.setCursor(0, 2);
  lcd.print("SpO2: ");
  lcd.print(finalSpO2);
  lcd.print("%");

  lcd.setCursor(0, 3);
  lcd.print("Good measurement");

  Serial.println();
  Serial.println(
    "STEP 2 COMPLETE."
  );

  delay(2000);

  return true;
}
// =====================================================
// BPM CONVERSION
// =====================================================

int convertHeartRate(
  int rawHeartRate
) {

  float corrected =
    (
      rawHeartRate *
      BPM_SCALE
    ) +
    BPM_OFFSET;

  return round(corrected);
}

// =====================================================
// HEIGHT MEASUREMENT
// =====================================================

bool measureHeight(
  float &distanceOut,
  float &heightOut
) {

  float distanceSum = 0;

  int validSamples = 0;

  float distanceBuffer[
    DISTANCE_SAMPLES
  ];

  unsigned long heightStart =
    millis();

  int lastSecond = -1;

  // ===================================================
  // 100 HEIGHT SAMPLES
  // ===================================================

  for (
    int i = 0;
    i < DISTANCE_SAMPLES;
    i++
  ) {

    digitalWrite(
      ULTRASONIC_TRIG_PIN,
      LOW
    );

    delayMicroseconds(2);

    digitalWrite(
      ULTRASONIC_TRIG_PIN,
      HIGH
    );

    delayMicroseconds(10);

    digitalWrite(
      ULTRASONIC_TRIG_PIN,
      LOW
    );

    unsigned long duration =
      pulseIn(
        ULTRASONIC_ECHO_PIN,
        HIGH,
        30000
      );

    if (duration != 0) {

      float distance =
        duration *
        0.0343 /
        2.0;

      if (
        distance >=
        ULTRASONIC_MIN_CM &&
        distance <=
        ULTRASONIC_MAX_CM
      ) {

        distanceBuffer[
          validSamples
        ] =
          distance;

        distanceSum +=
          distance;

        validSamples++;
      }
    }

    // -------------------------------------------------
    // TIMER DISPLAY
    // -------------------------------------------------

    int currentSecond =
      (
        millis() -
        heightStart
      ) / 1000;

    if (
      currentSecond !=
      lastSecond
    ) {

      lastSecond =
        currentSecond;

      Serial.print(
        "Collecting height... Time: "
      );

      Serial.print(
        currentSecond
      );

      Serial.println(
        " seconds"
      );

      lcd.setCursor(0, 1);
      lcd.print("Stay still...    ");

      lcd.setCursor(0, 2);
      lcd.print("Collecting data  ");

      lcd.setCursor(0, 3);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print(" sec     ");
    }

    delay(60);
  }

  // ===================================================
  // MINIMUM VALID SAMPLES
  // ===================================================

  if (validSamples < 50) {

    Serial.println(
      "Not enough valid height readings."
    );

    return false;
  }

  // ===================================================
  // AVERAGE DISTANCE
  // ===================================================

  float averageDistance =
    distanceSum /
    validSamples;

  // ===================================================
  // FILTER OUT LARGE DEVIATIONS
  // ===================================================

  float filteredSum = 0;

  int filteredCount = 0;

  for (
    int i = 0;
    i < validSamples;
    i++
  ) {

    if (
      abs(
        distanceBuffer[i] -
        averageDistance
      ) <= 5.0
    ) {

      filteredSum +=
        distanceBuffer[i];

      filteredCount++;
    }
  }

  // ===================================================
  // FINAL DISTANCE
  // ===================================================

  if (filteredCount >= 30) {

    distanceOut =
      filteredSum /
      filteredCount;

  } else {

    distanceOut =
      averageDistance;
  }

  // ===================================================
  // HEIGHT CONVERSION
  // ===================================================

  heightOut =
    FIXED_DISTANCE_CM -
    distanceOut;

  // ===================================================
  // VALIDATE HEIGHT
  // ===================================================

  if (
    heightOut < 0 ||
    heightOut > 198
  ) {

    return false;
  }

  // ===================================================
  // SERIAL RESULTS
  // ===================================================

  Serial.println();
  Serial.println(
    "HEIGHT CONVERSION"
  );

  Serial.print(
    "Reference distance: "
  );

  Serial.print(
    FIXED_DISTANCE_CM
  );

  Serial.println(" cm");

  Serial.print(
    "Measured distance: "
  );

  Serial.print(
    distanceOut,
    1
  );

  Serial.println(" cm");

  Serial.print(
    "Height: "
  );

  Serial.print(
    heightOut,
    1
  );

  Serial.println(" cm");

  Serial.print(
    "Valid samples: "
  );

  Serial.println(
    validSamples
  );

  Serial.print(
    "Filtered samples: "
  );

  Serial.println(
    filteredCount
  );

  return true;
}

