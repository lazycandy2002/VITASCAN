#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <LiquidCrystal_I2C.h>

MAX30105 sensor;
Adafruit_MLX90614 mlx;

// =====================================================
// 4x16 I2C LCD
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
// SETUP
// =====================================================

void setup() {

  Serial.begin(9600);
  Wire.begin();

  // ===================================================
  // LCD START
  // ===================================================

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("VITAL SIGNS");

  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  delay(2000);


  // ===================================================
  // SERIAL START
  // ===================================================

  Serial.println();
  Serial.println("================================");
  Serial.println("       VITAL SIGNS SYSTEM");
  Serial.println("================================");


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
      60,     // LED brightness
      4,      // averaging
      2,      // Red + IR
      100,    // sample rate
      411,    // pulse width
      4096    // ADC range
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
  // STEP 1: TEMPERATURE
  // ===================================================

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


  // ===================================================
  // TEMPERATURE MEASUREMENT
  // ===================================================

  Serial.println();
  Serial.println("Temperature measurement starting...");
  Serial.println("Please stay still.");


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("MEASURING TEMP");

  lcd.setCursor(0, 1);
  lcd.print("Please stay still");


  float temperatureSum = 0;
  int temperatureSamples = 0;

  unsigned long temperatureStart = millis();

  int lastSecond = -1;


  while (millis() - temperatureStart < 10000) {

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
      (millis() - temperatureStart) / 1000;


    if (currentSecond != lastSecond) {

      lastSecond = currentSecond;


      Serial.print("Temperature: ");
      Serial.print(currentSecond);
      Serial.println(" / 10 seconds");


      lcd.setCursor(0, 2);
      lcd.print("Time: ");
      lcd.print(currentSecond);
      lcd.print("/10       ");
    }


    delay(100);
  }


  // ===================================================
  // TEMPERATURE RESULT
  // ===================================================

  float finalTemperature = 0;


  if (temperatureSamples > 0) {

    finalTemperature =
      temperatureSum / temperatureSamples;
  }


  Serial.println();
  Serial.println("TEMPERATURE COMPLETE");


  if (temperatureSamples > 0) {

    Serial.print("Temperature: ");
    Serial.print(finalTemperature, 2);
    Serial.println(" C");


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("TEMP COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("Temperature:");

    lcd.setCursor(0, 2);
    lcd.print(finalTemperature, 2);

    lcd.write(223);
    lcd.print("C");

  } else {

    Serial.println("Temperature: INVALID");


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("TEMP COMPLETE");

    lcd.setCursor(0, 1);
    lcd.print("Temperature:");

    lcd.setCursor(0, 2);
    lcd.print("INVALID");
  }


  delay(3000);


  // ===================================================
  // STEP 2: PULSE + SpO2
  // ===================================================

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
  Serial.println("Place your finger on the MAX30102.");
  Serial.println("Cover the sensor completely.");
  Serial.println("Do not press too hard.");
  Serial.println("Keep your finger completely still.");
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


  // ===================================================
  // FINGER DETECTION
  // ===================================================

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


  while (millis() - checkStart < 5000) {

    sensor.check();


    while (sensor.available()) {

      latestIR =
        sensor.getIR();


      if (latestIR > 50000) {

        fingerDetected = true;

        break;
      }


      sensor.nextSample();
    }


    if (fingerDetected) {
      break;
    }
  }


  // ===================================================
  // FINGER ERROR
  // ===================================================

  if (!fingerDetected) {

    Serial.println();
    Serial.println("FINGER NOT DETECTED.");
    Serial.print("IR SIGNAL: ");
    Serial.println(latestIR);
    Serial.println("Try repositioning your finger.");
    Serial.println();
    Serial.println("Type START to restart.");


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("FINGER ERROR");

    lcd.setCursor(0, 1);
    lcd.print("NOT DETECTED");

    lcd.setCursor(0, 2);
    lcd.print("Reposition");

    lcd.setCursor(0, 3);
    lcd.print("Type START");


    return;
  }


  // ===================================================
  // FINGER DETECTED
  // ===================================================

  Serial.println();
  Serial.println("FINGER DETECTED.");
  Serial.println("Good position.");
  Serial.println();
  Serial.println("Stabilizing signal for 5 seconds...");


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("FINGER DETECTED");

  lcd.setCursor(0, 1);
  lcd.print("STABILIZING");


  // ===================================================
  // 5 SECOND STABILIZATION
  // ===================================================

  unsigned long stabilizeStart =
    millis();

  int stableLastSecond = -1;


  while (millis() - stabilizeStart < 5000) {

    sensor.check();


    while (sensor.available()) {

      sensor.nextSample();
    }


    int stableSecond =
      (millis() - stabilizeStart) / 1000;


    if (stableSecond != stableLastSecond) {

      stableLastSecond =
        stableSecond;


      Serial.print("Stabilizing: ");
      Serial.print(stableSecond);
      Serial.println(" / 5 seconds");


      lcd.setCursor(0, 2);
      lcd.print("Time: ");
      lcd.print(stableSecond);
      lcd.print("/5       ");
    }
  }


  // ===================================================
  // CLEAR OLD DATA
  // ===================================================

  while (sensor.available()) {

    sensor.nextSample();
  }


  // ===================================================
  // COLLECT 100 SAMPLES
  // ===================================================

  Serial.println();
  Serial.println("================================");
  Serial.println("COLLECTING SENSOR DATA");
  Serial.println("================================");

  Serial.println("Collecting 100 samples...");
  Serial.println("Keep finger completely still.");


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("COLLECTING DATA");

  lcd.setCursor(0, 1);
  lcd.print("100 SAMPLES");

  lcd.setCursor(0, 3);
  lcd.print("Keep finger still");


  int sampleCount = 0;

  unsigned long collectionStart =
    millis();


  while (sampleCount < BUFFER_SIZE) {

    sensor.check();


    while (sensor.available()) {

      uint32_t redValue =
        sensor.getRed();

      uint32_t irValue =
        sensor.getIR();


      redBuffer[sampleCount] =
        redValue;

      irBuffer[sampleCount] =
        irValue;


      sampleCount++;


      sensor.nextSample();


      // -----------------------------------------------
      // LCD SAMPLE COUNTER
      // -----------------------------------------------

      if (sampleCount % 10 == 0) {

        lcd.setCursor(0, 2);
        lcd.print("Samples: ");
        lcd.print(sampleCount);
        lcd.print("/100   ");


        Serial.print("Samples: ");
        Serial.print(sampleCount);
        Serial.println("/100");
      }
    }


    // -----------------------------------------------
    // TIMEOUT
    // -----------------------------------------------

    if (millis() - collectionStart > 15000) {

      Serial.println();
      Serial.println("ERROR: SENSOR TIMEOUT.");

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("SENSOR ERROR");

      lcd.setCursor(0, 1);
      lcd.print("TIMEOUT");

      lcd.setCursor(0, 2);
      lcd.print("Try again");

      lcd.setCursor(0, 3);
      lcd.print("Type START");

      return;
    }
  }


  // ===================================================
  // DATA COLLECTION COMPLETE
  // ===================================================

  Serial.println();
  Serial.println("100 SAMPLES COMPLETE.");

  Serial.print("Final RED: ");
  Serial.println(redBuffer[99]);

  Serial.print("Final IR: ");
  Serial.println(irBuffer[99]);


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("DATA COMPLETE");

  lcd.setCursor(0, 1);
  lcd.print("Calculating...");


  // ===================================================
  // CALCULATE HR + SpO2
  // ===================================================

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
  Serial.println("MAX30102 CALCULATION");
  Serial.println("================================");


  Serial.print("Raw Heart Rate: ");
  Serial.println(heartRate);

  Serial.print("HR Valid: ");
  Serial.println(validHeartRate);


  Serial.print("Raw SpO2: ");
  Serial.println(spo2);

  Serial.print("SpO2 Valid: ");
  Serial.println(validSpO2);


  // ===================================================
  // VALIDATE RESULTS
  // ===================================================

  bool finalHRValid = false;
  bool finalSpO2Valid = false;


  int finalHeartRate = 0;
  int finalSpO2 = 0;


  if (
    validHeartRate &&
    heartRate >= 40 &&
    heartRate <= 200
  ) {

    finalHeartRate =
      heartRate;

    finalHRValid = true;
  }


  if (
    validSpO2 &&
    spo2 >= 70 &&
    spo2 <= 100
  ) {

    finalSpO2 =
      spo2;

    finalSpO2Valid = true;
  }


  // ===================================================
  // FINAL SERIAL RESULTS
  // ===================================================

  Serial.println();
  Serial.println("================================");
  Serial.println("          FINAL RESULTS");
  Serial.println("================================");


  Serial.print("Temperature: ");

  if (temperatureSamples > 0) {

    Serial.print(finalTemperature, 2);
    Serial.println(" C");

  } else {

    Serial.println("INVALID");
  }


  Serial.print("Heart Rate: ");

  if (finalHRValid) {

    Serial.print(finalHeartRate);
    Serial.println(" BPM");

  } else {

    Serial.println("INVALID");
  }


  Serial.print("SpO2: ");

  if (finalSpO2Valid) {

    Serial.print(finalSpO2);
    Serial.println(" %");

  } else {

    Serial.println("INVALID");
  }


  Serial.println("================================");
  Serial.println("MEASUREMENT COMPLETE");
  Serial.println("================================");


  // ===================================================
  // LCD FINAL RESULTS
  // ===================================================

  lcd.clear();


  // LINE 1
  lcd.setCursor(0, 0);
  lcd.print("Temp: ");

  if (temperatureSamples > 0) {

    lcd.print(finalTemperature, 2);
    lcd.write(223);
    lcd.print("C");

  } else {

    lcd.print("INVALID");
  }


  // LINE 2
  lcd.setCursor(0, 1);
  lcd.print("HR: ");

  if (finalHRValid) {

    lcd.print(finalHeartRate);
    lcd.print(" BPM");

  } else {

    lcd.print("INVALID");
  }


  // LINE 3
  lcd.setCursor(0, 2);
  lcd.print("SpO2: ");

  if (finalSpO2Valid) {

    lcd.print(finalSpO2);
    lcd.print("%");

  } else {

    lcd.print("INVALID");
  }


  // LINE 4
  lcd.setCursor(0, 3);
  lcd.print("MEASUREMENT DONE");


  delay(5000);


  // ===================================================
  // SYSTEM READY AGAIN
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SYSTEM READY");

  lcd.setCursor(0, 1);
  lcd.print("Type START");

  lcd.setCursor(0, 2);
  lcd.print("for next test");


  Serial.println();
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