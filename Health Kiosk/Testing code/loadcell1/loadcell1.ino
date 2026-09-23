
#include "HX711.h"

#define DT 2
#define SCK 3

HX711 scale;

float calibration_factor = 1000.0;

void setup() {
  Serial.begin(9600);

  scale.begin(DT, SCK);

  Serial.println("Initializing scale...");
  delay(1000);

  scale.set_scale(calibration_factor);

  Serial.println();
  Serial.println("==============================");
  Serial.println("     YZC-1B LOAD CELL TEST");
  Serial.println("==============================");
  Serial.println();

  Serial.println("Are you ready to start?");
  Serial.println("Enter Y for YES or N for NO.");
}

void loop() {

  if (Serial.available() > 0) {

    char answer = Serial.read();

    if (answer == 'y') answer = 'Y';
    if (answer == 'n') answer = 'N';

    if (answer == 'Y') {

      // =================================
      // PREPARATION 1
      // =================================

      Serial.println();
      Serial.println("==============================");
      Serial.println("   PREPARATION 1 - 10 SECONDS");
      Serial.println("==============================");
      Serial.println("Keep the platform EMPTY.");
      Serial.println();

      for (int i = 10; i >= 1; i--) {

        Serial.print("Time remaining: ");
        Serial.print(i);
        Serial.println(" seconds");

        delay(1000);
      }

      Serial.println();
      Serial.println("Preparation 1 complete.");

      // =================================
      // ZERO / TARE
      // =================================

      Serial.println("Zeroing the scale...");
      delay(500);

      scale.tare();

      Serial.println("Scale zeroed.");
      Serial.println();

      // =================================
      // ASK IF READY
      // =================================

      Serial.println("==============================");
      Serial.println("     READY FOR MEASUREMENT?");
      Serial.println("==============================");
      Serial.println("Enter Y for YES or N for NO.");
      Serial.println();

      // Wait for Y/N
      while (true) {

        if (Serial.available() > 0) {

          char measureAnswer = Serial.read();

          if (measureAnswer == 'y') measureAnswer = 'Y';
          if (measureAnswer == 'n') measureAnswer = 'N';

          if (measureAnswer == 'Y') {
            break;
          }

          if (measureAnswer == 'N') {

            Serial.println();
            Serial.println("Measurement cancelled.");
            Serial.println();
            Serial.println("Are you ready to start another test?");
            Serial.println("Enter Y for YES or N for NO.");

            return;
          }
        }
      }

      // =================================
      // PREPARATION 2
      // =================================

      Serial.println();
      Serial.println("==============================");
      Serial.println("   PREPARATION 2 - 10 SECONDS");
      Serial.println("==============================");
      Serial.println("PLACE THE KNOWN WEIGHT NOW.");
      Serial.println("Keep the weight completely STILL.");
      Serial.println();

      for (int i = 10; i >= 1; i--) {

        Serial.print("Preparation time remaining: ");
        Serial.print(i);
        Serial.println(" seconds");

        delay(1000);
      }

      Serial.println();
      Serial.println("Preparation 2 complete.");
      Serial.println();

      // =================================
      // 10-SECOND READING
      // =================================

      Serial.println("==============================");
      Serial.println("     READING - 10 SECONDS");
      Serial.println("==============================");
      Serial.println();

      float total = 0;
      int readings = 0;

      unsigned long startTime = millis();
      int lastSecond = -1;

      while (millis() - startTime < 10000) {

        unsigned long elapsed = millis() - startTime;

        int currentSecond = elapsed / 1000;

        if (currentSecond != lastSecond) {

          lastSecond = currentSecond;

          int remaining = 10 - currentSecond;

          Serial.print("Reading time remaining: ");
          Serial.print(remaining);
          Serial.println(" seconds");
        }

        if (scale.is_ready()) {

          float weight = scale.get_units(1);

          total += weight;
          readings++;

          Serial.print("Reading ");
          Serial.print(readings);
          Serial.print(": ");
          Serial.print(weight, 2);
          Serial.println(" kg");
        }

        delay(100);
      }

      // =================================
      // CALCULATE MEAN
      // =================================

      float mean = 0;

      if (readings > 0) {
        mean = total / readings;
      }

      // =================================
      // FINAL RESULT
      // =================================

      Serial.println();
      Serial.println("==============================");
      Serial.println("       FINAL RESULT");
      Serial.println("==============================");

      Serial.print("Number of readings: ");
      Serial.println(readings);

      Serial.print("MEAN WEIGHT: ");
      Serial.print(mean, 2);
      Serial.println(" kg");

      Serial.println("==============================");
      Serial.println();

      Serial.println("Test finished.");
      Serial.println();

      Serial.println("Are you ready to start another test?");
      Serial.println("Enter Y for YES or N for NO.");
    }

    // =================================
    // CANCEL
    // =================================

    else if (answer == 'N') {

      Serial.println();
      Serial.println("Test cancelled.");
      Serial.println();
      Serial.println("Are you ready to start?");
      Serial.println("Enter Y for YES or N for NO.");
    }
  }
}

