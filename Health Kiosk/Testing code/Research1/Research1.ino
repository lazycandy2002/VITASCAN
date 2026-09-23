
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

// =====================================================
// LCD
// =====================================================

LiquidCrystal_I2C lcd(0x27, 16, 4);

// =====================================================
// MAX30102
// =====================================================

#define BUFFER_SIZE 100

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2;
int8_t validSpO2;

int32_t heartRate;
int8_t validHeartRate;

// =====================================================
// MAX30102 LIMITS
// =====================================================

#define IR_MIN 30000
#define IR_MAX 180000

#define RED_MIN 30000
#define RED_MAX 180000

#define FINGER_THRESHOLD 50000

#define SIGNAL_CHANGE_PERCENT 35

// =====================================================
// HC-SR04
// ARDUINO MEGA 2560
// =====================================================

#define TRIG_PIN 5
#define ECHO_PIN 18

// Sensor is fixed 200 cm from the floor
#define SENSOR_REFERENCE_CM 200.0

// =====================================================
// MEASUREMENT TIMES
// =====================================================

#define TEMPERATURE_TIME 5000
#define STABILIZATION_TIME 5000
#define HEIGHT_TIME 5000

// =====================================================
// HEIGHT SETTINGS
// =====================================================

#define MIN_DISTANCE_CM 2.0
#define MAX_DISTANCE_CM 200.0

#define MIN_HEIGHT_CM 50.0
#define MAX_HEIGHT_CM 200.0

#define MAX_HEIGHT_READINGS 200

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(9600);

  Wire.begin();

  // HC-SR04
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("VITAL SIGNS");

  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  delay(2000);

  // ===================================================
  // TEMPERATURE SENSOR
  // ===================================================

  if (mlx.begin()) {

    Serial.println("Temperature Sensor: CONNECTED");

  } else {

    Serial.println("Temperature Sensor: NOT FOUND");
  }

  // ===================================================
  // MAX30102
  // ===================================================

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

  // ===================================================
  // SYSTEM READY
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SYSTEM READY");

  lcd.setCursor(0, 1);
  lcd.print("Type START");

  lcd.setCursor(0, 2);
  lcd.print("Serial Monitor");

  Serial.println();
  Serial.println("================================");
  Serial.println("       VITAL SIGNS SYSTEM");
  Serial.println("       ARDUINO MEGA 2560");
  Serial.println("================================");
  Serial.println();
  Serial.println("SYSTEM READY");
  Serial.println("Type START and press Enter.");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {

  if (Serial.available()) {

    String command =
      Serial.readStringUntil('\n');

    command.trim();
    command.toUpperCase();

    if (command == "START") {

      runTest();
    }
  }
}

// =====================================================
// MAIN TEST
// =====================================================

void runTest() {

  // ===================================================
  // FINAL VARIABLES
  // ===================================================

  float finalTemperature = 0;

  int finalHeartRate = 0;
  int finalSpO2 = 0;

  float finalDistance = 0;
  float finalHeight = 0;

  bool temperatureComplete = false;
  bool step2Complete = false;
  bool step3Complete = false;

  bool finalHRValid = false;
  bool finalSpO2Valid = false;

  // ===================================================
  // STEP 1
  // TEMPERATURE
  // ===================================================

  while (!temperatureComplete) {

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 1: TEMPERATURE");
    Serial.println("================================");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 1");

    lcd.setCursor(0, 1);
    lcd.print("TEMPERATURE");

    delay(1500);

    Serial.println();
    Serial.println("Prepare for temperature measurement.");
    Serial.println("Point MLX90614 toward forehead.");
    Serial.println("Keep the distance consistent.");
    Serial.println();
    Serial.println("Type READY when ready.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("TEMP READY?");

    lcd.setCursor(0, 1);
    lcd.print("Type READY");

    lcd.setCursor(0, 2);
    lcd.print("Forehead");

    lcd.setCursor(0, 3);
    lcd.print("Stay still");

    waitForReady();

    // =================================================
    // MEASURE TEMPERATURE FOR 5 SECONDS
    // =================================================

    Serial.println();
    Serial.println("Temperature measurement starting...");
    Serial.println("Please stay still.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("MEASURING TEMP");

    lcd.setCursor(0, 1);
    lcd.print("Please wait...");

    float temperatureSum = 0;
    int temperatureSamples = 0;

    unsigned long temperatureStart = millis();

    int lastSecond = -1;

    while (
      millis() - temperatureStart <
      TEMPERATURE_TIME
    ) {

      float temperature =
        mlx.readObjectTempC();

      if (
        temperature >= 20.0 &&
        temperature <= 45.0
      ) {

        temperatureSum += temperature;
        temperatureSamples++;
      }

      int currentSecond =
        (millis() - temperatureStart) / 1000;

      if (currentSecond != lastSecond) {

        lastSecond = currentSecond;

        Serial.print("Temperature time: ");
        Serial.print(currentSecond);
        Serial.println(" / 5 seconds");

        lcd.setCursor(0, 3);

        lcd.print("Time: ");
        lcd.print(currentSecond);
        lcd.print("/5       ");
      }

      delay(100);
    }

    // =================================================
    // CHECK TEMPERATURE
    // =================================================

    if (temperatureSamples == 0) {

      Serial.println();
      Serial.println("================================");
      Serial.println("TEMPERATURE INVALID");
      Serial.println("STEP 1 MUST BE REPEATED");
      Serial.println("================================");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("TEMP INVALID");

      lcd.setCursor(0, 1);
      lcd.print("NO VALID DATA");

      lcd.setCursor(0, 2);
      lcd.print("Redo Step 1?");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    finalTemperature =
      temperatureSum / temperatureSamples;

    // =================================================
    // EXTRA TEMPERATURE VALIDATION
    // =================================================

    if (
      finalTemperature < 20.0 ||
      finalTemperature > 45.0
    ) {

      Serial.println();
      Serial.println("TEMPERATURE RESULT INVALID.");
      Serial.println("STEP 1 MUST BE REPEATED.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("TEMP INVALID");

      lcd.setCursor(0, 1);
      lcd.print("Result:");

      lcd.setCursor(0, 2);
      lcd.print(finalTemperature, 1);
      lcd.write(223);
      lcd.print("C");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // TEMPERATURE SUCCESS
    // =================================================

    temperatureComplete = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 1 COMPLETE");
    Serial.println("================================");

    Serial.print("Temperature: ");
    Serial.print(finalTemperature, 2);
    Serial.println(" C");

    Serial.print("Valid samples: ");
    Serial.println(temperatureSamples);

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("TEMP COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("Temperature:");

    lcd.setCursor(0, 2);
    lcd.print(finalTemperature, 2);

    lcd.write(223);
    lcd.print("C");

    delay(3000);
  }

  // ===================================================
  // STEP 2
  // PULSE + SpO2
  // ===================================================

  while (!step2Complete) {

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 2: PULSE + SpO2");
    Serial.println("================================");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 2");

    lcd.setCursor(0, 1);
    lcd.print("PULSE + SpO2");

    delay(1500);

    Serial.println();
    Serial.println("Place your finger on MAX30102.");
    Serial.println("Cover the sensor completely.");
    Serial.println("Do not press too hard.");
    Serial.println("Keep your finger still.");
    Serial.println();
    Serial.println("Type READY when positioned.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("FINGER READY?");

    lcd.setCursor(0, 1);
    lcd.print("Type READY");

    lcd.setCursor(0, 2);
    lcd.print("Cover sensor");

    lcd.setCursor(0, 3);
    lcd.print("Stay still");

    waitForReady();

    // =================================================
    // CHECK FINGER
    // =================================================

    Serial.println();
    Serial.println("Checking finger placement...");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("CHECKING FINGER");

    lcd.setCursor(0, 1);
    lcd.print("Please wait...");

    unsigned long checkStart = millis();

    bool fingerDetected = false;

    long latestIR = 0;

    while (
      millis() - checkStart < 5000
    ) {

      sensor.check();

      while (sensor.available()) {

        latestIR =
          sensor.getIR();

        if (
          latestIR >= FINGER_THRESHOLD &&
          latestIR >= IR_MIN &&
          latestIR <= IR_MAX
        ) {

          fingerDetected = true;

          break;
        }

        sensor.nextSample();
      }

      if (fingerDetected) {
        break;
      }
    }

    if (!fingerDetected) {

      Serial.println();
      Serial.println("================================");
      Serial.println("FINGER NOT DETECTED");
      Serial.println("STEP 2 MUST BE REPEATED");
      Serial.println("================================");

      Serial.print("IR: ");
      Serial.println(latestIR);

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 2 INVALID");

      lcd.setCursor(0, 1);
      lcd.print("NO FINGER");

      lcd.setCursor(0, 2);
      lcd.print("Reposition");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // STABILIZATION
    // =================================================

    Serial.println();
    Serial.println("FINGER DETECTED.");
    Serial.println("Stabilizing for 5 seconds...");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("FINGER DETECTED");

    lcd.setCursor(0, 1);
    lcd.print("Please wait...");

    unsigned long stabilizeStart =
      millis();

    int stableLastSecond = -1;

    uint32_t previousIR = 0;
    uint32_t previousRED = 0;

    bool havePreviousReading = false;

    bool stabilizationFailed = false;

    while (
      millis() - stabilizeStart <
      STABILIZATION_TIME
    ) {

      sensor.check();

      while (sensor.available()) {

        uint32_t currentIR =
          sensor.getIR();

        uint32_t currentRED =
          sensor.getRed();

        if (
          currentIR < IR_MIN ||
          currentIR > IR_MAX ||
          currentRED < RED_MIN ||
          currentRED > RED_MAX
        ) {

          stabilizationFailed = true;

          Serial.println("INVALID SIGNAL.");

          break;
        }

        if (
          currentIR < FINGER_THRESHOLD
        ) {

          stabilizationFailed = true;

          Serial.println("FINGER LOST.");

          break;
        }

        if (havePreviousReading) {

          long irDifference =
            abs(
              (long)currentIR -
              (long)previousIR
            );

          long redDifference =
            abs(
              (long)currentRED -
              (long)previousRED
            );

          long irPercent =
            (irDifference * 100L) /
            previousIR;

          long redPercent =
            (redDifference * 100L) /
            previousRED;

          if (
            irPercent > SIGNAL_CHANGE_PERCENT ||
            redPercent > SIGNAL_CHANGE_PERCENT
          ) {

            stabilizationFailed = true;

            Serial.println("SIGNAL FLUCTUATION.");

            break;
          }
        }

        previousIR = currentIR;
        previousRED = currentRED;

        havePreviousReading = true;

        sensor.nextSample();
      }

      if (stabilizationFailed) {
        break;
      }

      int stableSecond =
        (millis() - stabilizeStart) / 1000;

      if (
        stableSecond != stableLastSecond
      ) {

        stableLastSecond =
          stableSecond;

        Serial.print("Stabilizing: ");
        Serial.print(stableSecond);
        Serial.println(" / 5 seconds");

        lcd.setCursor(0, 3);

        lcd.print("Time: ");
        lcd.print(stableSecond);
        lcd.print("/5       ");
      }
    }

    // =================================================
    // STABILIZATION FAILED
    // =================================================

    if (stabilizationFailed) {

      Serial.println();
      Serial.println("================================");
      Serial.println("STEP 2 INVALID");
      Serial.println("STEP 2 MUST BE REPEATED");
      Serial.println("================================");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 2 INVALID");

      lcd.setCursor(0, 1);
      lcd.print("SIGNAL ERROR");

      lcd.setCursor(0, 2);
      lcd.print("Reposition");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // CLEAR OLD DATA
    // =================================================

    while (sensor.available()) {
      sensor.nextSample();
    }

    // =================================================
    // COLLECT 100 SAMPLES
    // =================================================

    Serial.println();
    Serial.println("Collecting 100 samples...");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("COLLECTING");

    lcd.setCursor(0, 1);
    lcd.print("MEASUREMENT");

    lcd.setCursor(0, 2);
    lcd.print("Please wait...");

    lcd.setCursor(0, 3);
    lcd.print("Samples: 0/100");

    int sampleCount = 0;

    unsigned long collectionStart =
      millis();

    bool collectionFailed = false;

    while (
      sampleCount < BUFFER_SIZE
    ) {

      sensor.check();

      while (sensor.available()) {

        uint32_t redValue =
          sensor.getRed();

        uint32_t irValue =
          sensor.getIR();

        if (
          irValue < IR_MIN ||
          irValue > IR_MAX ||
          redValue < RED_MIN ||
          redValue > RED_MAX ||
          irValue < FINGER_THRESHOLD
        ) {

          collectionFailed = true;

          Serial.println(
            "INVALID DATA DURING COLLECTION."
          );

          break;
        }

        redBuffer[sampleCount] =
          redValue;

        irBuffer[sampleCount] =
          irValue;

        sampleCount++;

        sensor.nextSample();

        if (
          sampleCount % 10 == 0
        ) {

          Serial.print("Samples: ");
          Serial.print(sampleCount);
          Serial.println("/100");

          lcd.setCursor(0, 3);

          lcd.print("Samples: ");
          lcd.print(sampleCount);
          lcd.print("/100   ");
        }
      }

      if (collectionFailed) {
        break;
      }

      if (
        millis() - collectionStart >
        15000
      ) {

        collectionFailed = true;

        Serial.println(
          "SENSOR TIMEOUT."
        );

        break;
      }
    }

    // =================================================
    // COLLECTION FAILED
    // =================================================

    if (collectionFailed) {

      Serial.println();
      Serial.println("================================");
      Serial.println("STEP 2 INVALID");
      Serial.println("STEP 2 MUST BE REPEATED");
      Serial.println("================================");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("STEP 2 INVALID");

      lcd.setCursor(0, 1);
      lcd.print("BAD SENSOR DATA");

      lcd.setCursor(0, 2);
      lcd.print("Reposition");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // CALCULATE HR + SpO2
    // =================================================

    Serial.println();
    Serial.println("100 SAMPLES COMPLETE.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("DATA COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("Calculating...");

    maxim_heart_rate_and_oxygen_saturation(
      irBuffer,
      BUFFER_SIZE,
      redBuffer,
      &spo2,
      &validSpO2,
      &heartRate,
      &validHeartRate
    );

    Serial.println();
    Serial.println("================================");
    Serial.println("MAX30102 RESULT");
    Serial.println("================================");

    Serial.print("Heart Rate: ");
    Serial.println(heartRate);

    Serial.print("HR Valid: ");
    Serial.println(validHeartRate);

    Serial.print("SpO2: ");
    Serial.println(spo2);

    Serial.print("SpO2 Valid: ");
    Serial.println(validSpO2);

    // =================================================
    // VALIDATE HR
    // =================================================

    finalHRValid = false;
    finalSpO2Valid = false;

    finalHeartRate = 0;
    finalSpO2 = 0;

    if (
      validHeartRate &&
      heartRate >= 40 &&
      heartRate <= 200
    ) {

      finalHeartRate =
        heartRate;

      finalHRValid = true;
    }

    // =================================================
    // VALIDATE SpO2
    // =================================================

    if (
      validSpO2 &&
      spo2 >= 70 &&
      spo2 <= 100
    ) {

      finalSpO2 =
        spo2;

      finalSpO2Valid = true;
    }

    // =================================================
    // INVALID HR / SpO2
    // =================================================

    if (
      !finalHRValid ||
      !finalSpO2Valid
    ) {

      Serial.println();
      Serial.println("================================");
      Serial.println("INVALID HR / SpO2");
      Serial.println("STEP 2 MUST BE REPEATED");
      Serial.println("================================");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("INVALID RESULT");

      lcd.setCursor(0, 1);
      lcd.print("HR:");

      if (finalHRValid) {
        lcd.print(finalHeartRate);
      } else {
        lcd.print("INVALID");
      }

      lcd.setCursor(0, 2);
      lcd.print("SpO2:");

      if (finalSpO2Valid) {
        lcd.print(finalSpO2);
        lcd.print("%");
      } else {
        lcd.print("INVALID");
      }

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // STEP 2 SUCCESS
    // =================================================

    step2Complete = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 2 COMPLETE");
    Serial.println("================================");

    Serial.print("Heart Rate: ");
    Serial.print(finalHeartRate);
    Serial.println(" BPM");

    Serial.print("SpO2: ");
    Serial.print(finalSpO2);
    Serial.println(" %");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 2 COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("HR:");
    lcd.print(finalHeartRate);
    lcd.print(" BPM");

    lcd.setCursor(0, 2);
    lcd.print("SpO2:");
    lcd.print(finalSpO2);
    lcd.print("%");

    delay(3000);
  }

  // ===================================================
  // STEP 3
  // HEIGHT
  // ===================================================

  while (!step3Complete) {

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 3: HEIGHT");
    Serial.println("================================");

    Serial.println();
    Serial.println("HC-SR04 reference = 200 cm");
    Serial.println("Stand directly underneath");
    Serial.println("the ultrasonic sensor.");
    Serial.println();
    Serial.println("Type READY when positioned.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("STEP 3");

    lcd.setCursor(0, 1);
    lcd.print("HEIGHT");

    lcd.setCursor(0, 2);
    lcd.print("REFERENCE: 200cm");

    lcd.setCursor(0, 3);
    lcd.print("Type READY");

    waitForReady();

    // =================================================
    // HEIGHT MEASUREMENT
    // =================================================

    Serial.println();
    Serial.println("Measuring height...");
    Serial.println("Please stand completely still.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("MEASURING HEIGHT");

    lcd.setCursor(0, 1);
    lcd.print("Please wait...");

    lcd.setCursor(0, 2);
    lcd.print("Collecting");

    lcd.setCursor(0, 3);
    lcd.print("Time: 0/5");

    float heightReadings[
      MAX_HEIGHT_READINGS
    ];

    int heightReadingCount = 0;

    unsigned long heightStart =
      millis();

    int lastHeightSecond = -1;

    // =================================================
    // CONTINUOUS MEASUREMENT
    // =================================================

    while (
      millis() - heightStart <
      HEIGHT_TIME
    ) {

      // ---------------------------------------------
      // HC-SR04 TRIGGER
      // ---------------------------------------------

      digitalWrite(
        TRIG_PIN,
        LOW
      );

      delayMicroseconds(2);

      digitalWrite(
        TRIG_PIN,
        HIGH
      );

      delayMicroseconds(10);

      digitalWrite(
        TRIG_PIN,
        LOW
      );

      // ---------------------------------------------
      // ECHO
      // ---------------------------------------------

      unsigned long duration =
        pulseIn(
          ECHO_PIN,
          HIGH,
          40000
        );

      if (duration > 0) {

        float distance =
          duration * 0.0343 / 2.0;

        // -------------------------------------------
        // VALID DISTANCE
        // -------------------------------------------

        if (
          distance >= MIN_DISTANCE_CM &&
          distance <= MAX_DISTANCE_CM
        ) {

          if (
            heightReadingCount <
            MAX_HEIGHT_READINGS
          ) {

            heightReadings[
              heightReadingCount
            ] = distance;

            heightReadingCount++;

            Serial.print("Distance: ");
            Serial.print(distance, 2);
            Serial.println(" cm");
          }
        }
      }

      // ---------------------------------------------
      // TIME DISPLAY
      // ---------------------------------------------

      int currentSecond =
        (millis() - heightStart) / 1000;

      if (
        currentSecond != lastHeightSecond
      ) {

        lastHeightSecond =
          currentSecond;

        Serial.print(
          "Height measurement: "
        );

        Serial.print(currentSecond);

        Serial.println(
          " / 5 seconds"
        );

        lcd.setCursor(0, 3);

        lcd.print("Time: ");
        lcd.print(currentSecond);
        lcd.print("/5       ");
      }

      delay(50);
    }

    // =================================================
    // CHECK DATA
    // =================================================

    Serial.println();
    Serial.print("Valid height readings: ");
    Serial.println(heightReadingCount);

    if (
      heightReadingCount < 10
    ) {

      Serial.println();
      Serial.println("================================");
      Serial.println("HEIGHT INVALID");
      Serial.println("NOT ENOUGH READINGS");
      Serial.println("STEP 3 MUST BE REPEATED");
      Serial.println("================================");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("HEIGHT INVALID");

      lcd.setCursor(0, 1);
      lcd.print("NOT ENOUGH DATA");

      lcd.setCursor(0, 2);
      lcd.print("Stand correctly");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // SORT READINGS
    // =================================================

    for (
      int i = 0;
      i < heightReadingCount - 1;
      i++
    ) {

      for (
        int j = i + 1;
        j < heightReadingCount;
        j++
      ) {

        if (
          heightReadings[j] <
          heightReadings[i]
        ) {

          float temp =
            heightReadings[i];

          heightReadings[i] =
            heightReadings[j];

          heightReadings[j] =
            temp;
        }
      }
    }

    // =================================================
    // MEDIAN
    // =================================================

    float medianDistance;

    if (
      heightReadingCount % 2 == 0
    ) {

      int middle =
        heightReadingCount / 2;

      medianDistance =
        (
          heightReadings[middle - 1] +
          heightReadings[middle]
        ) / 2.0;

    } else {

      medianDistance =
        heightReadings[
          heightReadingCount / 2
        ];
    }

    // =================================================
    // CALCULATE HEIGHT
    // =================================================

    finalDistance =
      medianDistance;

    finalHeight =
      SENSOR_REFERENCE_CM -
      finalDistance;

    // =================================================
    // HEIGHT VALIDATION
    // =================================================

    Serial.println();
    Serial.println("================================");
    Serial.println("HEIGHT RESULT");
    Serial.println("================================");

    Serial.print("Sensor reference: ");
    Serial.print(SENSOR_REFERENCE_CM);
    Serial.println(" cm");

    Serial.print("Median distance: ");
    Serial.print(finalDistance, 2);
    Serial.println(" cm");

    Serial.print("Calculated height: ");
    Serial.print(finalHeight, 2);
    Serial.println(" cm");

    // -----------------------------------------------
    // INVALID HEIGHT
    // -----------------------------------------------

    if (
      finalHeight < MIN_HEIGHT_CM ||
      finalHeight > MAX_HEIGHT_CM
    ) {

      Serial.println();
      Serial.println("HEIGHT RESULT INVALID.");
      Serial.println("STEP 3 MUST BE REPEATED.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("HEIGHT INVALID");

      lcd.setCursor(0, 1);
      lcd.print("Result:");

      lcd.setCursor(0, 2);
      lcd.print(finalHeight, 1);
      lcd.print(" cm");

      lcd.setCursor(0, 3);
      lcd.print("READY = RETRY");

      waitForReady();

      continue;
    }

    // =================================================
    // STEP 3 SUCCESS
    // =================================================

    step3Complete = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("STEP 3 COMPLETE");
    Serial.println("================================");

    Serial.print("Valid readings: ");
    Serial.println(heightReadingCount);

    Serial.print("Median distance: ");
    Serial.print(finalDistance, 2);
    Serial.println(" cm");

    Serial.print("Height: ");
    Serial.print(finalHeight, 2);
    Serial.println(" cm");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("HEIGHT COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("Distance:");

    lcd.print(finalDistance, 1);
    lcd.print("cm");

    lcd.setCursor(0, 2);
    lcd.print("Height:");

    lcd.print(finalHeight, 1);
    lcd.print("cm");

    lcd.setCursor(0, 3);
    lcd.print("Samples:");

    lcd.print(heightReadingCount);

    delay(3000);
  }

  // ===================================================
  // FINAL RESULTS
  // ===================================================

  Serial.println();
  Serial.println("================================");
  Serial.println("          FINAL RESULTS");
  Serial.println("================================");

  Serial.print("Temperature: ");
  Serial.print(finalTemperature, 2);
  Serial.println(" C");

  Serial.print("Heart Rate: ");
  Serial.print(finalHeartRate);
  Serial.println(" BPM");

  Serial.print("SpO2: ");
  Serial.print(finalSpO2);
  Serial.println(" %");

  Serial.print("Height: ");
  Serial.print(finalHeight, 2);
  Serial.println(" cm");

  Serial.println("================================");
  Serial.println("MEASUREMENT COMPLETE");
  Serial.println("================================");

  // =================================================
  // FINAL LCD
  // =================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("T:");

  lcd.print(finalTemperature, 1);
  lcd.write(223);
  lcd.print("C");

  lcd.setCursor(0, 1);
  lcd.print("HR:");

  lcd.print(finalHeartRate);
  lcd.print(" BPM");

  lcd.setCursor(0, 2);
  lcd.print("SpO2:");

  lcd.print(finalSpO2);
  lcd.print("%");

  lcd.setCursor(0, 3);
  lcd.print("H:");

  lcd.print(finalHeight, 1);
  lcd.print("cm");

  delay(5000);

  // =================================================
  // SYSTEM READY AGAIN
  // =================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SYSTEM READY");

  lcd.setCursor(0, 1);
  lcd.print("Type START");

  lcd.setCursor(0, 2);
  lcd.print("for next test");

  Serial.println();
  Serial.println("SYSTEM READY.");
  Serial.println("Type START for another measurement.");
}

// =====================================================
// WAIT FOR READY
// =====================================================

void waitForReady() {

  while (true) {

    if (Serial.available()) {

      String command =
        Serial.readStringUntil('\n');

      command.trim();
      command.toUpperCase();

      if (command == "READY") {

        Serial.println();
        Serial.println("READY CONFIRMED.");

        delay(1000);

        return;
      }

      Serial.println();
      Serial.println("Please type READY.");
    }
  }
}

