/*
 * AirQ - ESP32-S3 Air Quality Monitor
 * 
 * Features:
 * - Reads PMSA003I air quality sensor via I2C
 * - Logs data to onboard flash storage
 * - Provides live and historical data over BLE GATT
 * - Visual air quality indication via neopixel
 * - Power management with configurable sleep modes
 * - USB power detection for development mode
 * - Time synchronization via BLE with visual status indicators
 * 
 * LED Status Indicators:
 * - Green: Good air quality or successful time sync
 * - Yellow: Moderate air quality
 * - Orange: Poor air quality
 * - Red: Very poor air quality or errors
 * - Blue pulse: Time sync required (data logging disabled)
 * 
 * Power Modes:
 * - Low Power Mode (default): Deep sleep between readings for maximum battery life
 * - Responsive Mode: Light sleep to maintain BLE connectivity
 * 
 * BLE Characteristics:
 * - Live Data: Current PM readings and battery level
 * - Logged Data: Historical data retrieval
 * - Battery: Battery level percentage
 * - Power Mode: Configure sleep behavior (1=low power, 0=responsive)
 */

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <esp_sleep.h>
#include <esp_bt.h>
#include <esp_bt_main.h>
#include <esp_wifi.h>
#include <UMS3.h>
#include "Adafruit_PM25AQI.h"
#include "time.h"
#include "sys/time.h"

// PMSA003I sensor readings structure
struct SensorData {
  uint16_t pm1_0_standard;
  uint16_t pm2_5_standard;
  uint16_t pm10_0_standard;
  uint16_t pm1_0_env;
  uint16_t pm2_5_env;
  uint16_t pm10_0_env;
  uint16_t particles_03um;
  uint16_t particles_05um;
  uint16_t particles_10um;
  uint16_t particles_25um;
  uint16_t particles_50um;
  uint16_t particles_100um;
  uint8_t battery_level;
  uint32_t timestamp;
};

// Compact log structure for flash storage (only essential data)
struct LogData {
  uint32_t timestamp;
  uint16_t pm1_0_env;
  uint16_t pm2_5_env;
  uint16_t pm10_0_env;
  uint8_t battery_level;
  // Total: 11 bytes instead of 32 bytes
};

// Pin definitions for FeatherS3
#define PMSA003I_ADDR 0x12 // PMSA003I I2C address (not needed with Adafruit library)

// UMS3 helper object
UMS3 ums3;

// Adafruit PM25AQI sensor object
Adafruit_PM25AQI aqi = Adafruit_PM25AQI();

// BLE UUIDs
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define LIVE_DATA_UUID      "12345678-1234-1234-1234-123456789abd"
#define LOGGED_DATA_UUID    "12345678-1234-1234-1234-123456789abe"
#define BATTERY_UUID        "12345678-1234-1234-1234-123456789abf"
#define POWER_MODE_UUID     "12345678-1234-1234-1234-123456789ac0"
#define RTC_TIME_UUID       "12345678-1234-1234-1234-123456789ac1"
#define CHUNK_INFO_UUID     "12345678-1234-1234-1234-123456789ac2"
#define CHUNK_REQUEST_UUID  "87654321-4321-4321-4321-cba987654321"

// Error codes for blink patterns
#define ERROR_NONE 0
#define ERROR_SENSOR_NOT_FOUND 1
#define ERROR_SENSOR_TIMEOUT 2
#define ERROR_INVALID_DATA 3
#define ERROR_BLE_INIT_FAILED 4
#define ERROR_FLASH_WRITE_FAILED 5

// Global error tracking
uint8_t lastError = ERROR_NONE;

// Global variables
BLEServer* pServer = NULL;
BLECharacteristic* pLiveDataCharacteristic = NULL;
BLECharacteristic* pLoggedDataCharacteristic = NULL;
BLECharacteristic* pBatteryCharacteristic = NULL;
BLECharacteristic* pPowerModeCharacteristic = NULL;
BLECharacteristic* pRTCTimeCharacteristic = NULL;
BLECharacteristic* pChunkInfoCharacteristic = NULL;
BLECharacteristic* pChunkRequestCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;
Preferences preferences;
bool useLittleFS = false; // Flag to track which storage system is active
SensorData currentReading;
int logIndex = 0;
const int MAX_LOG_ENTRIES = 100000; // With LittleFS: 100k entries = ~1MB for logs (plenty of space on 16MB flash)
const int MAX_CHUNK_SIZE = 400; // Safe size for BLE MTU
const int ENTRIES_PER_BATCH = 200; // Process data in smaller batches to avoid memory issues

// Chunked data transfer variables
String loggedDataCache = "";
int totalChunks = 0;
int currentChunk = 0;
int totalEntriesToSend = 0;
int entriesProcessed = 0;
int startEntryIndex = 0;

// RTC time management
bool rtcTimeSet = false;       // Basic RTC state
bool rtcTimeAccurate = false;  // Only true after successful BLE sync

// Task handles for dual-core operation
TaskHandle_t BLETaskHandle = NULL;
TaskHandle_t SensorTaskHandle = NULL;

// Shared data protection
SemaphoreHandle_t dataMutex;
volatile bool newDataAvailable = false;
SensorData sharedSensorData;

unsigned long lastConnectionCheck = 0;
const unsigned long CONNECTION_CHECK_INTERVAL = 5000; // Check every 5 seconds
unsigned long lastAdvertisingStart = 0;
const unsigned long ADVERTISING_RESTART_INTERVAL = 30000; // Restart advertising every 30 seconds if no connection
bool bleInitialized = false;

// Sleep time (20 seconds for more frequent advertising)
#define uS_TO_S_FACTOR 1000000
#define TIME_TO_SLEEP 10

// Power management settings
bool lowPowerMode = true; // Set to false for light sleep (BLE responsive), true for deep sleep (battery saving)

// Forward declarations
void sendLoggedData();
void prepareLoggedDataForChunking();
void loadNextBatch();
void sendLoggedDataChunk();
void clearFlashStorage();
void restartAdvertising();
void checkBLEConnection();
void safeBLEUpdate();
void BLETask(void *pvParameters);
void SensorTask(void *pvParameters);
void updateSharedData(SensorData newData);
void checkFlashHealth();
void repairFlashStorage();
void printSensorData(SensorData data);
void showErrorBlink();
void showTimeSyncRequired();
time_t getRTCTime();
String formatRTCTime(time_t timestamp);
void setRTCTime(time_t epochTime);
void setRTCTimeFromBLE(time_t epochTime);
void initRTC();
void checkFlashCapacity();
void testFlashWriteCapacity();

// LittleFS storage functions
bool initLittleFS();
void migrateLegacyData();
void saveLogToLittleFS(const LogData& logEntry);
LogData readLogFromLittleFS(int index);
void clearLogsLittleFS();
void printLittleFSInfo();
void optimizeLittleFSStorage();
String getLittleFSLogPath(int index);
void analyzeSystemMemory();

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("BLE Client connected");

      // Don't update connection parameters immediately - let the client settle first
      // Connection parameter updates will be handled by the system automatically
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("BLE Client disconnected");
      
      // Small delay before restarting advertising
      vTaskDelay(pdMS_TO_TICKS(500));
      
      // Restart advertising automatically
      restartAdvertising();
    }
};

class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
    void onRead(BLECharacteristic* pCharacteristic) {
      String uuid = pCharacteristic->getUUID().toString();
      Serial.println("BLE Read received on UUID: " + uuid);
      
      if (uuid == LOGGED_DATA_UUID) {
        Serial.println("=== LOGGED DATA READ REQUEST ===");
        sendLoggedDataChunk();
      } else if (uuid == CHUNK_INFO_UUID) {
        // Send chunk info: "totalChunks,currentChunk"
        String chunkInfo = String(totalChunks) + "," + String(currentChunk);
        pCharacteristic->setValue(chunkInfo.c_str());
        Serial.println("Chunk info read: " + chunkInfo);
      } else if (uuid == CHUNK_REQUEST_UUID) {
        // Send current chunk request value
        String chunkRequest = String(currentChunk);
        pCharacteristic->setValue(chunkRequest.c_str());
        Serial.println("Chunk request read: " + chunkRequest);
      } else if (uuid == POWER_MODE_UUID) {
        // Send current power mode setting
        String powerModeStr = lowPowerMode ? "1" : "0";
        pCharacteristic->setValue(powerModeStr.c_str());
        Serial.println("Power mode read: " + powerModeStr);
      } else if (uuid == RTC_TIME_UUID) {
        // Send current RTC time as Unix timestamp
        time_t currentTime = getRTCTime();
        String timeStr = String((unsigned long)currentTime);
        pCharacteristic->setValue(timeStr.c_str());
        Serial.println("RTC time read: " + timeStr + " (" + formatRTCTime(currentTime) + ")");
      }
    }
    
    void onWrite(BLECharacteristic* pCharacteristic) {
      String uuid = pCharacteristic->getUUID().toString();
      Serial.println("BLE Write received on UUID: " + uuid);
      
      if (uuid == CHUNK_REQUEST_UUID) {
        // Handle chunk request - expect chunk number as string
        String chunkValue = pCharacteristic->getValue().c_str();
        int requestedChunk = chunkValue.toInt();
        Serial.println("Chunk request received: '" + chunkValue + "' (parsed as: " + String(requestedChunk) + ")");
        
        if (requestedChunk == -1) {
          // Special request to prepare logged data for chunking
          Serial.println("=== PREPARING DATA FOR CHUNKING ===");
          prepareLoggedDataForChunking();
          Serial.println("Logged data prepared for chunking. Total chunks: " + String(totalChunks));
        } else if (requestedChunk >= 0 && requestedChunk < totalChunks) {
          currentChunk = requestedChunk;
          // Update chunk info characteristic to reflect current chunk
          String chunkInfo = String(totalChunks) + "," + String(currentChunk);
          pChunkInfoCharacteristic->setValue(chunkInfo.c_str());
          Serial.println("Chunk request accepted for chunk: " + String(currentChunk) + "/" + String(totalChunks - 1));

          // Immediately send the requested chunk via notification
          sendLoggedDataChunk();
        } else {
          Serial.println("Invalid chunk request: " + String(requestedChunk) + " (valid range: 0-" + String(totalChunks - 1) + ")");
        }
      } else if (pCharacteristic->getUUID().toString() == POWER_MODE_UUID) {
        // Update power mode setting
        String value = pCharacteristic->getValue().c_str();
        bool newMode = (value == "1");
        
        if (newMode != lowPowerMode) {
          lowPowerMode = newMode;
          preferences.putBool("lowPowerMode", lowPowerMode);
          Serial.println("Power mode changed to: " + String(lowPowerMode ? "low power (deep sleep)" : "responsive (light sleep)"));
        }
      } else if (pCharacteristic->getUUID().toString() == RTC_TIME_UUID) {
        // Update RTC time - expect Unix timestamp as string
        String timeValue = pCharacteristic->getValue().c_str();
        time_t newTime = (time_t)timeValue.toInt();
        
        if (newTime > 1609459200) { // Sanity check: after Jan 1, 2021
          setRTCTimeFromBLE(newTime);
          Serial.println("BLE time sync successful: " + String((unsigned long)newTime) + " (" + formatRTCTime(newTime) + ")");
        } else {
          Serial.println("Invalid RTC time received: " + timeValue);
        }
      }
    }
};

void initPMSA003I() {
  // Initialize PMSA003I sensor
  Serial.println("Initializing PMSA003I sensor...");
  if (!aqi.begin_I2C()) {
    Serial.println("Could not find PMSA003I sensor!");
    lastError = ERROR_SENSOR_NOT_FOUND;
    // Continue anyway, sensor readings will fail but other functions work
  } else {
    Serial.println("PMSA003I sensor found!");
  }
}

void setup() {
  Serial.begin(115200);
  
  // Wait for serial to initialize
  delay(1000);
  
  // Check reset reason
  esp_reset_reason_t resetReason = esp_reset_reason();
  Serial.print("Reset reason: ");
  switch (resetReason) {
    case ESP_RST_POWERON: Serial.println("Power on reset"); break;
    case ESP_RST_EXT: Serial.println("External reset"); break;
    case ESP_RST_SW: Serial.println("Software reset"); break;
    case ESP_RST_PANIC: Serial.println("Exception/panic reset"); break;
    case ESP_RST_INT_WDT: Serial.println("Interrupt watchdog reset"); break;
    case ESP_RST_TASK_WDT: Serial.println("Task watchdog reset"); break;
    case ESP_RST_WDT: Serial.println("Other watchdog reset"); break;
    case ESP_RST_DEEPSLEEP: Serial.println("Deep sleep reset"); break;
    case ESP_RST_BROWNOUT: Serial.println("Brownout reset"); break;
    case ESP_RST_SDIO: Serial.println("SDIO reset"); break;
    default: Serial.println("Unknown reset"); break;
  }
  
  Serial.println("AirQ Device starting...");
  
  // Create mutex for shared data protection
  dataMutex = xSemaphoreCreateMutex();
  if (dataMutex == NULL) {
    Serial.println("Failed to create mutex!");
    while(1); // Stop execution
  }
  
  // Initialize UMS3 helper
  ums3.begin();
  
  // Turn on sensor power (LDO2 for PMSA003I)
  ums3.setLDO2Power(true);
  delay(3000); // Wait for sensor to boot up (Adafruit library recommends 3 seconds)
  
  // Initialize sensor using Adafruit library
  initPMSA003I();
  
  // Initialize I2C (already done by aqi.begin_I2C(), but keeping for compatibility)
  Wire.setClock(100000); // Set I2C to 100kHz for stability
  
  // Initialize preferences for flash storage
  Serial.println("Initializing flash storage...");
  if (!preferences.begin("airq", false)) {
    Serial.println("Error: Failed to initialize preferences, trying to clear and retry...");
    preferences.clear();
    if (!preferences.begin("airq", false)) {
      Serial.println("Error: Still failed to initialize preferences");
      // Continue anyway, flash logging will be disabled
    }
  }
  
  // Initialize LittleFS for high-capacity logging
  Serial.println("Initializing LittleFS...");
  if (initLittleFS()) {
    Serial.println("✅ LittleFS initialized successfully");
    printLittleFSInfo();
    
    // Migrate existing preferences data to LittleFS
    Serial.println("Migrating legacy data to LittleFS...");
    migrateLegacyData();
    
    // Load log index from LittleFS metadata if migration was successful
    if (useLittleFS) {
      File metaFile = LittleFS.open("/logs/metadata.txt", "r");
      if (metaFile) {
        String indexStr = metaFile.readStringUntil('\n');
        logIndex = indexStr.toInt();
        metaFile.close();
        Serial.println("✅ Using LittleFS for storage - log index: " + String(logIndex));
      }
    }
  } else {
    Serial.println("❌ LittleFS initialization failed, falling back to Preferences");
    useLittleFS = false;
  }
  
  // Fallback to preferences log index if not using LittleFS
  if (!useLittleFS) {
    logIndex = preferences.getInt("logIndex", 0);
    Serial.println("📝 Using Preferences for storage - log index: " + String(logIndex));
  }
  
  // Perform flash health check
  Serial.println("Starting flash health check...");
  checkFlashHealth();
  
  // Perform detailed flash capacity analysis
  Serial.println("Starting flash capacity analysis...");
  checkFlashCapacity();
  
  // Test actual flash write capacity
  Serial.println("Starting flash write capacity test...");
  testFlashWriteCapacity();
  
  // If flash is in poor condition, perform repair
  if (preferences.freeEntries() < 50 && logIndex > 0) {
    Serial.println("Flash appears to be in poor condition, performing repair...");
    repairFlashStorage();
    checkFlashHealth(); // Check again after repair
    checkFlashCapacity(); // Check capacity again after repair
  }
  
  // Load power mode setting from flash
  lowPowerMode = preferences.getBool("lowPowerMode", true);
  Serial.println("Low power mode: " + String(lowPowerMode ? "enabled (deep sleep)" : "disabled (light sleep)"));
  
  // Initialize RTC
  initRTC();
  
  // Show logging status
  if (!rtcTimeAccurate) {
    Serial.println("⚠️  Data logging DISABLED - RTC time not accurate");
    Serial.println("   Connect via BLE to sync time and enable logging");
    
    // Show visual indication that time sync is required
    Serial.println("💙 LED will show blue pulse pattern until time is synced");
  } else {
    Serial.println("✅ Data logging ENABLED - RTC time is accurate");
  }
  
  // LED startup indication first
  ums3.setPixelPower(true);
  ums3.setPixelBrightness(50);
  blinkStartup();
  
  // Create BLE task on Core 0 (dedicated to BLE communication)
  xTaskCreatePinnedToCore(
    BLETask,           // Task function
    "BLE_Task",        // Task name
    10000,             // Stack size (bytes)
    NULL,              // Task parameters
    2,                 // Priority (higher than sensor task)
    &BLETaskHandle,    // Task handle
    0                  // Core 0
  );
  
  // Create Sensor task on Core 1 (dedicated to sensor reading and logging)
  xTaskCreatePinnedToCore(
    SensorTask,        // Task function
    "Sensor_Task",     // Task name
    10000,             // Stack size (bytes)
    NULL,              // Task parameters
    1,                 // Priority (lower than BLE task)
    &SensorTaskHandle, // Task handle
    1                  // Core 1
  );
  
  Serial.println("AirQ Device initialized - Running dual core tasks");
}

void loop() {
  // Main loop is now minimal - tasks handle the work
  // Just keep the watchdog happy and handle any global operations
  
  // Check for serial input to trigger flash analysis
  if (Serial.available() > 0) {
    char input = Serial.read();
    
    // Clear any remaining characters in the buffer
    while (Serial.available() > 0) {
      Serial.read();
    }
    
    Serial.println("\n=== MANUAL FLASH ANALYSIS TRIGGERED ===");
    Serial.println("Input received: '" + String(input) + "'");
    Serial.println("Running comprehensive flash analysis...\n");
    
    // Run comprehensive system memory analysis first
    Serial.println("0. Comprehensive System Memory Analysis:");
    analyzeSystemMemory();
    Serial.println();
    
    // Run all flash analysis functions
    Serial.println("1. Flash Health Check:");
    checkFlashHealth();
    Serial.println();
    
    Serial.println("2. Flash Capacity Analysis:");
    checkFlashCapacity();
    Serial.println();
    
    Serial.println("3. Flash Write Capacity Test:");
    testFlashWriteCapacity();
    Serial.println();
    
    // LittleFS optimization if available
    if (useLittleFS) {
      Serial.println("4. LittleFS Optimization:");
      optimizeLittleFSStorage();
      Serial.println();
    }
    
    // Additional useful information
    Serial.println(useLittleFS ? "5. Quick System Status:" : "4. Quick System Status:");
    Serial.println("Tasks running: BLE Core 0, Sensor Core 1");
    Serial.println("Power mode: " + String(lowPowerMode ? "Low power (deep sleep)" : "Responsive (light sleep)"));
    Serial.println("Last error: " + String(lastError == ERROR_NONE ? "None" : String(lastError)));
    
    Serial.println("\n=== ANALYSIS COMPLETE ===");
    Serial.println("Send any character to run analysis again");
    Serial.println("========================================\n");
  }
  
  delay(1000);
  yield();
}

bool initBLE() {
  try {
  // Initialize BLE with proper error handling
  BLEDevice::init("AirQ Sensor");
  
  // Set BLE power to reduce issues
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P3);
  
  pServer = BLEDevice::createServer();
  
  if (!pServer) {
    lastError = ERROR_BLE_INIT_FAILED;
    Serial.println("Error: Failed to create BLE server");
    return false;
  }
  
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  if (!pService) {
    lastError = ERROR_BLE_INIT_FAILED;
    Serial.println("Error: Failed to create BLE service");
    return false;
  }

  // Live data characteristic
  pLiveDataCharacteristic = pService->createCharacteristic(
                      LIVE_DATA_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pLiveDataCharacteristic->addDescriptor(new BLE2902());

  // Logged data characteristic (enable notify for streaming)
  pLoggedDataCharacteristic = pService->createCharacteristic(
                      LOGGED_DATA_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pLoggedDataCharacteristic->addDescriptor(new BLE2902());
  pLoggedDataCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  // Battery characteristic
  pBatteryCharacteristic = pService->createCharacteristic(
                      BATTERY_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pBatteryCharacteristic->addDescriptor(new BLE2902());

  // Power mode characteristic
  // Temporarily disable power mode characteristic to test if there's a characteristic limit
  /*
  pPowerModeCharacteristic = pService->createCharacteristic(
                      POWER_MODE_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE
                    );
  pPowerModeCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
  
  // Set initial power mode value
  String powerModeStr = lowPowerMode ? "1" : "0";
  pPowerModeCharacteristic->setValue(powerModeStr.c_str());
  */

  // RTC time characteristic
  pRTCTimeCharacteristic = pService->createCharacteristic(
                      RTC_TIME_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE
                    );
  pRTCTimeCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
  
  // Set initial RTC time value
  time_t currentTime = getRTCTime();
  String timeStr = String((unsigned long)currentTime);
  pRTCTimeCharacteristic->setValue(timeStr.c_str());

  // Chunk info characteristic (read-only)
  pChunkInfoCharacteristic = pService->createCharacteristic(
                      CHUNK_INFO_UUID,
                      BLECharacteristic::PROPERTY_READ
                    );
  if (pChunkInfoCharacteristic) {
    pChunkInfoCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
    pChunkInfoCharacteristic->setValue("0,0"); // totalChunks,currentChunk
    Serial.println("✅ Chunk info characteristic created successfully");
  } else {
    Serial.println("❌ Failed to create chunk info characteristic");
  }

  // Chunk request characteristic (write-only for better Web Bluetooth compatibility)
  pChunkRequestCharacteristic = pService->createCharacteristic(
                      CHUNK_REQUEST_UUID,
                      BLECharacteristic::PROPERTY_WRITE
                    );
  if (pChunkRequestCharacteristic) {
    pChunkRequestCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
    pChunkRequestCharacteristic->setValue("0"); // Current chunk request
    Serial.println("✅ Chunk request characteristic created successfully");
  } else {
    Serial.println("❌ Failed to create chunk request characteristic");
  }

  pService->start();
  
  // Debug: Print all created characteristics
  Serial.println("=== All BLE Characteristics Created ===");
  Serial.println("Live Data UUID: " + String(LIVE_DATA_UUID));
  Serial.println("Logged Data UUID: " + String(LOGGED_DATA_UUID));
  Serial.println("Battery UUID: " + String(BATTERY_UUID));
  Serial.println("Power Mode UUID: " + String(POWER_MODE_UUID));
  Serial.println("RTC Time UUID: " + String(RTC_TIME_UUID));
  Serial.println("Chunk Info UUID: " + String(CHUNK_INFO_UUID));
  Serial.println("Chunk Request UUID: " + String(CHUNK_REQUEST_UUID));
  Serial.println("==========================================");
  
  // Add a delay to ensure all characteristics are fully registered before advertising
  delay(1000);
  Serial.println("Service started, waiting before advertising...");

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  
  // Set more conservative advertising parameters for better compatibility
  pAdvertising->setMinInterval(0x20); // 20ms
  pAdvertising->setMaxInterval(0x40); // 40ms
  
  // Start advertising
  pAdvertising->start();
  
  Serial.println("BLE advertising started");
  return true;
  
  } catch (const std::exception& e) {
    Serial.println("Exception during BLE initialization: " + String(e.what()));
    lastError = ERROR_BLE_INIT_FAILED;
    return false;
  } catch (...) {
    Serial.println("Unknown exception during BLE initialization");
    lastError = ERROR_BLE_INIT_FAILED;
    return false;
  }
}

bool readPMSA003I(SensorData* data = &currentReading) {
  PM25_AQI_Data aqiData;
  
  // Read data using Adafruit library
  if (!aqi.read(&aqiData)) {
    Serial.println("Could not read from AQI sensor");
    lastError = ERROR_SENSOR_TIMEOUT;
    return false;
  }
  
  // Copy data to our structure
  data->pm1_0_standard = aqiData.pm10_standard;
  data->pm2_5_standard = aqiData.pm25_standard;
  data->pm10_0_standard = aqiData.pm100_standard;
  data->pm1_0_env = aqiData.pm10_env;
  data->pm2_5_env = aqiData.pm25_env;
  data->pm10_0_env = aqiData.pm100_env;
  data->particles_03um = aqiData.particles_03um;
  data->particles_05um = aqiData.particles_05um;
  data->particles_10um = aqiData.particles_10um;
  data->particles_25um = aqiData.particles_25um;
  data->particles_50um = aqiData.particles_50um;
  data->particles_100um = aqiData.particles_100um;
  
  // Clear error if successful
  lastError = ERROR_NONE;
  Serial.println("AQI reading success");
  return true;
}

uint8_t getBatteryLevel() {
  // Get battery voltage using UMS3 helper
  float voltage = ums3.getBatteryVoltage();
  
  // Convert to percentage (3.0V = 0%, 4.2V = 100%)
  uint8_t percentage = constrain(map(voltage * 100, 300, 420, 0, 100), 0, 100);
  
  return percentage;
}

void logDataToFlash(SensorData data) {
  // Check if RTC time has been properly synced via BLE before logging
  if (!rtcTimeAccurate) {
    Serial.println("Skipping data logging - RTC time not accurate (needs BLE sync)");
    Serial.println("Connect via BLE and sync time to enable logging");
    return;
  }
  
  // Check if timestamp is reasonable (after Jan 1, 2021)
  time_t currentTime = getRTCTime();
  if (currentTime < 1609459200) {
    Serial.println("Skipping data logging - RTC time appears invalid: " + formatRTCTime(currentTime));
    return;
  }
  
  // Create compact log entry
  LogData logEntry;
  logEntry.timestamp = (uint32_t)currentTime;
  logEntry.pm1_0_env = data.pm1_0_env;
  logEntry.pm2_5_env = data.pm2_5_env;
  logEntry.pm10_0_env = data.pm10_0_env;
  logEntry.battery_level = data.battery_level;
  
  // Use LittleFS if available, otherwise fall back to Preferences
  if (useLittleFS) {
    saveLogToLittleFS(logEntry);
    return;
  }
  
  // Legacy Preferences-based storage (fallback)
  // Use a more efficient key system
  String key = "log" + String(logIndex % MAX_LOG_ENTRIES);
  
  // Check available flash space more conservatively
  size_t freeEntries = preferences.freeEntries();
  Serial.println("Flash status - Free entries: " + String(freeEntries) + ", Log index: " + String(logIndex));
  
  if (freeEntries < 10) {
    Serial.println("Warning: Very low flash space, performing targeted cleanup...");
    
    // Only remove entries that would be overwritten anyway in circular buffer
    if (logIndex >= MAX_LOG_ENTRIES) {
      // Remove the entry we're about to overwrite
      String oldKey = "log" + String((logIndex - MAX_LOG_ENTRIES) % MAX_LOG_ENTRIES);
      if (preferences.remove(oldKey.c_str())) {
        Serial.println("Removed old entry to make space: " + oldKey);
      }
    }
  }
  
  // Store compact log entry with error checking
  size_t result = preferences.putBytes(key.c_str(), &logEntry, sizeof(LogData));
  
  if (result == 0) {
    lastError = ERROR_FLASH_WRITE_FAILED;
    Serial.println("Error: Failed to write to flash");
    Serial.println("Key: " + key + ", Size: " + String(sizeof(LogData)) + " bytes");
    Serial.println("Free entries after cleanup: " + String(preferences.freeEntries()));
    
    // Emergency cleanup - only remove very specific old entries
    Serial.println("Emergency cleanup - removing oldest entries...");
    if (logIndex >= MAX_LOG_ENTRIES) {
      // Remove oldest entries in circular buffer range
      for (int i = 0; i < 10; i++) {
        String oldKey = "log" + String((logIndex - MAX_LOG_ENTRIES + i) % MAX_LOG_ENTRIES);
        if (preferences.remove(oldKey.c_str())) {
          Serial.println("Emergency: Removed " + oldKey);
        }
      }
    } else {
      // If we haven't filled the buffer yet, remove any legacy entries
      for (int i = 0; i < 10; i++) {
        String legacyKey = "log_" + String(i);
        if (preferences.remove(legacyKey.c_str())) {
          Serial.println("Emergency: Removed legacy " + legacyKey);
        }
      }
    }
    
    // Final retry attempt
    result = preferences.putBytes(key.c_str(), &logEntry, sizeof(LogData));
    if (result == 0) {
      Serial.println("Error: Flash write failed even after emergency cleanup");
      Serial.println("This may indicate flash wear or corruption");
      return;
    } else {
      Serial.println("Flash write succeeded after emergency cleanup");
    }
  }
  
  // Update log index
  logIndex++;
  size_t indexResult = preferences.putInt("logIndex", logIndex);
  
  if (indexResult == 0) {
    Serial.println("Warning: Failed to update log index");
    // Try to continue anyway
  } else {
    Serial.println("Data logged successfully to flash, entry: " + String(logIndex));
    Serial.println("Compact log size: " + String(sizeof(LogData)) + " bytes (vs " + String(sizeof(SensorData)) + " bytes full)");
  }
}

void updateBLECharacteristics() {
  // Check if BLE is properly initialized
  if (!pLiveDataCharacteristic || !pBatteryCharacteristic) {
    Serial.println("BLE characteristics not initialized");
    return;
  }
  
  // Update live data
  String liveData = String(currentReading.pm1_0_env) + "," + 
                   String(currentReading.pm2_5_env) + "," + 
                   String(currentReading.pm10_0_env) + "," + 
                   String(currentReading.battery_level);
  
  try {
    pLiveDataCharacteristic->setValue(liveData.c_str());
    pLiveDataCharacteristic->notify();
    
    // Update battery
    pBatteryCharacteristic->setValue(&currentReading.battery_level, 1);
    pBatteryCharacteristic->notify();
  } catch (...) {
    Serial.println("Error updating BLE characteristics");
  }
}

void prepareLoggedDataForChunking() {
  debugLogEntries(); // Debug what's actually stored
  
  // Calculate range of entries to send
  startEntryIndex = max(0, logIndex - MAX_LOG_ENTRIES);
  totalEntriesToSend = min(logIndex, MAX_LOG_ENTRIES);
  entriesProcessed = 0;
  
  Serial.println("Preparing logged data for chunking, range: " + String(startEntryIndex) + " to " + String(logIndex));
  Serial.println("Will attempt to send up to " + String(totalEntriesToSend) + " entries");
  
  // Estimate chunks needed (each entry ~30 chars, chunk size 400)
  int estimatedChars = totalEntriesToSend * 30;
  totalChunks = max(1, (estimatedChars + MAX_CHUNK_SIZE - 1) / MAX_CHUNK_SIZE);
  currentChunk = 0;
  
  // Clear any existing cache
  loggedDataCache = "";
  
  // Load first batch
  loadNextBatch();
  
  // Update chunk info characteristic
  String chunkInfo = String(totalChunks) + "," + String(currentChunk);
  pChunkInfoCharacteristic->setValue(chunkInfo.c_str());
  
  Serial.println("Data prepared for estimated " + String(totalChunks) + " chunks");
}

void loadNextBatch() {
  loggedDataCache = "";
  int batchEnd = min(entriesProcessed + ENTRIES_PER_BATCH, totalEntriesToSend);
  int entriesLoaded = 0;
  
  Serial.println("Loading batch: entries " + String(entriesProcessed) + " to " + String(batchEnd));
  
  for (int i = entriesProcessed; i < batchEnd; i++) {
    int actualIndex = startEntryIndex + i;
    LogData logEntry;
    bool dataLoaded = false;
    
    // Try LittleFS first if available
    if (useLittleFS) {
      logEntry = readLogFromLittleFS(actualIndex);
      if (logEntry.timestamp > 0) { // Check if valid data was read
        dataLoaded = true;
      }
    }
    
    // Fall back to Preferences if LittleFS didn't work
    if (!dataLoaded) {
      String key = "log" + String(actualIndex % MAX_LOG_ENTRIES);
      size_t bytesRead = preferences.getBytes(key.c_str(), &logEntry, sizeof(LogData));
      if (bytesRead == sizeof(LogData)) {
        dataLoaded = true;
      } else {
        // Try legacy format for backward compatibility
        String oldKey = "log_" + String(actualIndex % MAX_LOG_ENTRIES);
        SensorData legacyData;
        size_t legacyBytesRead = preferences.getBytes(oldKey.c_str(), &legacyData, sizeof(SensorData));
        if (legacyBytesRead == sizeof(SensorData)) {
          // Convert legacy data
          logEntry.timestamp = legacyData.timestamp;
          logEntry.pm1_0_env = legacyData.pm1_0_env;
          logEntry.pm2_5_env = legacyData.pm2_5_env;
          logEntry.pm10_0_env = legacyData.pm10_0_env;
          logEntry.battery_level = legacyData.battery_level;
          dataLoaded = true;
        }
      }
    }
    
    if (dataLoaded) {
      loggedDataCache += String(logEntry.timestamp) + "," +
                        String(logEntry.pm1_0_env) + "," +
                        String(logEntry.pm2_5_env) + "," +
                        String(logEntry.pm10_0_env) + "," +
                        String(logEntry.battery_level) + ";";
      entriesLoaded++;
    }
  }
  
  entriesProcessed = batchEnd;
  Serial.println("Loaded " + String(entriesLoaded) + " entries into cache (" + String(loggedDataCache.length()) + " chars)");
  
  if (loggedDataCache.length() == 0) {
    loggedDataCache = "No data available";
  }
}

void sendLoggedDataChunk() {
  Serial.println("=== SEND LOGGED DATA CHUNK ===");
  Serial.println("Cache length: " + String(loggedDataCache.length()));
  Serial.println("Current chunk: " + String(currentChunk));
  Serial.println("Total chunks: " + String(totalChunks));
  
  if (loggedDataCache.length() == 0) {
    Serial.println("No cached data available, preparing data...");
    prepareLoggedDataForChunking();
  }
  
  String chunkData = "";
  
  // Calculate position within current cache
  int chunkStart = currentChunk * MAX_CHUNK_SIZE;
  int globalChunkStart = 0; // Position across all chunks ever processed
  
  // Check if we need to load more data
  bool needMoreData = false;
  if (loggedDataCache.length() < MAX_CHUNK_SIZE && entriesProcessed < totalEntriesToSend) {
    needMoreData = true;
  }
  
  // Load more data if current cache is insufficient
  if (needMoreData) {
    String existingData = loggedDataCache;
    loadNextBatch();
    // If we got more data, append it
    if (loggedDataCache != existingData) {
      // Continue from where we left off
    }
  }
  
  // Extract chunk from current cache
  if (loggedDataCache.length() > 0) {
    int startPos = 0; // Always start from beginning of current cache
    int endPos = min(MAX_CHUNK_SIZE, (int)loggedDataCache.length());
    chunkData = loggedDataCache.substring(startPos, endPos);
    
    // Remove sent data from cache to prepare for next chunk
    if (endPos < loggedDataCache.length()) {
      loggedDataCache = loggedDataCache.substring(endPos);
    } else {
      loggedDataCache = ""; // Cache is empty, will load more on next request
    }
    
    Serial.println("Sending chunk " + String(currentChunk) + "/" + String(totalChunks - 1) + 
                   " (" + String(chunkData.length()) + " chars): '" + 
                   chunkData.substring(0, 50) + (chunkData.length() > 50 ? "..." : "") + "'");
  } else if (entriesProcessed >= totalEntriesToSend) {
    chunkData = ""; // End of data
    Serial.println("All data has been sent");
  } else {
    chunkData = "No data available";
    Serial.println("No data could be loaded");
  }
  
  pLoggedDataCharacteristic->setValue(chunkData.c_str());
  pLoggedDataCharacteristic->notify();
  Serial.println("Chunk data (" + String(chunkData.length()) + " chars) notified successfully");
}

void sendLoggedData() {
  // Legacy function for backward compatibility - prepare data and send first chunk
  prepareLoggedDataForChunking();
  sendLoggedDataChunk();
}

void updateLEDStatus(SensorData data = currentReading) {
  // Color code based on PM2.5 levels (WHO air quality standards)
  if (data.pm2_5_env <= 15) {
    // Good air quality - Green
    ums3.setPixelColor(0, 255, 0);
    delay(500);
    ums3.setPixelColor(0, 0, 0);
  } else if (data.pm2_5_env <= 25) {
    // Moderate air quality - Yellow
    ums3.setPixelColor(255, 255, 0);
    delay(500);
    ums3.setPixelColor(0, 0, 0);
  } else if (data.pm2_5_env <= 50) {
    // Poor air quality - Orange
    ums3.setPixelColor(255, 165, 0);
    delay(500);
    ums3.setPixelColor(0, 0, 0);
  } else {
    // Very poor air quality - Red
    ums3.setPixelColor(255, 0, 0);
    delay(500);
    ums3.setPixelColor(0, 0, 0);
  }
}

void blinkStartup() {
  // Startup sequence - rainbow effect
  for (int i = 0; i < 256; i += 8) {
    uint32_t color = ums3.colorWheel(i);
    ums3.setPixelColor(color);
    delay(20);
  }
  ums3.setPixelColor(0, 0, 0); // Turn off
}

void clearFlashStorage() {
  Serial.println("Clearing flash storage...");
  
  // Clear both storage systems
  if (useLittleFS) {
    clearLogsLittleFS();
  }
  
  preferences.clear();
  logIndex = 0;
  preferences.putInt("logIndex", 0);
  preferences.putBool("lowPowerMode", true);
  lowPowerMode = true;
  
  Serial.println("Flash storage cleared and reset to defaults");
}

// Flash health check and maintenance
void checkFlashHealth() {
  Serial.println("=== Flash Health Check ===");
  Serial.println("Total entries: " + String(preferences.freeEntries()));
  Serial.println("Current log index: " + String(logIndex));
  Serial.println("Max log entries: " + String(MAX_LOG_ENTRIES));
  Serial.println("Compact log size: " + String(sizeof(LogData)) + " bytes");
  Serial.println("Full sensor data size: " + String(sizeof(SensorData)) + " bytes");
  
  // Check if we have any orphaned keys
  int actualEntries = 0;
  for (int i = 0; i < min(logIndex, MAX_LOG_ENTRIES); i++) {
    String key = "log" + String(i);
    LogData testEntry;
    if (preferences.getBytes(key.c_str(), &testEntry, sizeof(LogData)) == sizeof(LogData)) {
      actualEntries++;
    }
  }
  
  Serial.println("Actual log entries found: " + String(actualEntries));
  Serial.println("===========================");
}

// Check flash capacity and storage requirements
void checkFlashCapacity() {
  Serial.println("🔍 checkFlashCapacity() function called");
  Serial.println("=== FLASH CAPACITY ANALYSIS ===");
  
  // Show flash chip information
  Serial.println("--- Flash Chip Information ---");
  size_t flashChipSize = ESP.getFlashChipSize();
  uint32_t flashChipSpeed = ESP.getFlashChipSpeed();
  uint32_t flashChipMode = ESP.getFlashChipMode();
  
  Serial.printf("Flash chip size: %u bytes (%.2f MB)\n", flashChipSize, flashChipSize / (1024.0 * 1024.0));
  Serial.printf("Flash speed: %u Hz (%.1f MHz)\n", flashChipSpeed, flashChipSpeed / 1000000.0);
  Serial.print("Flash mode: ");
  switch(flashChipMode) {
    case 0: Serial.println("QIO"); break;
    case 1: Serial.println("QOUT"); break; 
    case 2: Serial.println("DIO"); break;
    case 3: Serial.println("DOUT"); break;
    default: Serial.println("Unknown (" + String(flashChipMode) + ")"); break;
  }
  
  // Flash utilization by partition type
  Serial.println("--- Flash Partition Usage ---");
  size_t sketchSize = ESP.getSketchSize();
  size_t freeSketchSpace = ESP.getFreeSketchSpace();
  size_t totalSketchSpace = sketchSize + freeSketchSpace;
  
  Serial.printf("App partition: %u bytes (%.2f MB)\n", totalSketchSpace, totalSketchSpace / (1024.0 * 1024.0));
  Serial.printf("  Used by sketch: %u bytes (%.2f MB, %.1f%%)\n", 
                sketchSize, sketchSize / (1024.0 * 1024.0), 
                (sketchSize * 100.0) / totalSketchSpace);
  Serial.printf("  Free for OTA: %u bytes (%.2f MB, %.1f%%)\n", 
                freeSketchSpace, freeSketchSpace / (1024.0 * 1024.0),
                (freeSketchSpace * 100.0) / totalSketchSpace);
  
  // Estimate remaining flash for data storage
  size_t systemOverhead = flashChipSize * 0.1; // Rough estimate for bootloader, partitions, etc.
  size_t availableForData = flashChipSize - totalSketchSpace - systemOverhead;
  Serial.printf("Estimated available for data: %u bytes (%.2f MB)\n", 
                availableForData, availableForData / (1024.0 * 1024.0));
  
  // Show current storage system
  Serial.println("--- Current Storage System ---");
  if (useLittleFS) {
    Serial.println("📂 Active Storage: LittleFS (Direct Flash Access)");
    printLittleFSInfo();
  } else {
    Serial.println("📂 Active Storage: NVS/Preferences (Limited Partition)");
  }
  
  // Calculate storage requirements first
  size_t logEntrySize = sizeof(LogData);
  size_t totalLogStorageNeeded = MAX_LOG_ENTRIES * logEntrySize;
  size_t keyOverheadPerEntry = 25; // Estimated overhead per key (key name + NVS metadata)
  size_t totalOverhead = MAX_LOG_ENTRIES * keyOverheadPerEntry;
  size_t totalStorageNeeded = totalLogStorageNeeded + totalOverhead;
  
  Serial.println("--- Storage Requirements ---");
  Serial.println("Log entry size: " + String(logEntrySize) + " bytes");
  Serial.println("Max log entries: " + String(MAX_LOG_ENTRIES));
  Serial.println("Raw data storage needed: " + String(totalLogStorageNeeded) + " bytes (" + String(totalLogStorageNeeded / 1024) + " KB)");
  Serial.println("Estimated key overhead: " + String(totalOverhead) + " bytes (" + String(totalOverhead / 1024) + " KB)");
  Serial.println("Total storage needed: " + String(totalStorageNeeded) + " bytes (" + String(totalStorageNeeded / 1024) + " KB)");
  
  // Check current NVS usage
  Serial.println("--- Current NVS Flash Usage ---");
  Serial.println("Free entries available: " + String(preferences.freeEntries()));
  Serial.println("Current log index: " + String(logIndex));
  
  // Estimate used storage
  size_t currentUsedStorage = min(logIndex, MAX_LOG_ENTRIES) * (logEntrySize + keyOverheadPerEntry);
  Serial.println("Estimated current usage: " + String(currentUsedStorage) + " bytes (" + String(currentUsedStorage / 1024) + " KB)");
  
  // Typical ESP32-S3 NVS partition sizes (based on common configurations)
  size_t typicalNVSSize = 20480; // 20KB is common default
  Serial.println("--- Capacity Analysis ---");
  Serial.println("Typical NVS partition size: " + String(typicalNVSSize) + " bytes (" + String(typicalNVSSize / 1024) + " KB)");
  
  float utilizationPercent = (float)totalStorageNeeded / typicalNVSSize * 100;
  Serial.println("Estimated storage utilization for 10K entries: " + String(utilizationPercent, 1) + "%");
  
  if (totalStorageNeeded > typicalNVSSize) {
    Serial.println("❌ CRITICAL: 10K entries likely exceed typical NVS capacity!");
    Serial.println("   Recommended MAX_LOG_ENTRIES: " + String((typicalNVSSize * 0.8) / (logEntrySize + keyOverheadPerEntry)));
    Serial.println("   Current requirement exceeds typical 20KB NVS partition");
  } else if (utilizationPercent > 80) {
    Serial.println("⚠️  WARNING: High storage utilization (" + String(utilizationPercent, 1) + "%)");
    Serial.println("   May cause flash wear issues with 10K entries");
  } else {
    Serial.println("✅ Storage requirements should fit in typical NVS partition");
  }
  
  // Check for immediate flash issues
  Serial.println("--- Flash Health Indicators ---");
  if (preferences.freeEntries() < 10) {
    Serial.println("❌ CRITICAL: Almost no free entries (" + String(preferences.freeEntries()) + ")!");
    Serial.println("   Flash is likely full or corrupted");
  } else if (preferences.freeEntries() < 50) {
    Serial.println("❌ CRITICAL: Very few free entries (" + String(preferences.freeEntries()) + ")!");
    Serial.println("   This indicates potential flash wear or fragmentation");
  } else if (preferences.freeEntries() < 200) {
    Serial.println("⚠️  WARNING: Low free entries (" + String(preferences.freeEntries()) + ")");
    Serial.println("   Flash may be experiencing wear");
  } else {
    Serial.println("✅ Free entries look healthy (" + String(preferences.freeEntries()) + ")");
  }
  
  // Calculate how many entries we can actually store
  size_t maxPossibleEntries = preferences.freeEntries() / 2; // Conservative estimate
  Serial.println("Estimated max storable entries with current free space: " + String(maxPossibleEntries));
  
  if (maxPossibleEntries < MAX_LOG_ENTRIES) {
    Serial.println("⚠️  WARNING: May not be able to store " + String(MAX_LOG_ENTRIES) + " entries");
    Serial.println("   Consider reducing MAX_LOG_ENTRIES to: " + String(maxPossibleEntries));
  }
  
  Serial.println("================================");
}

// Test flash write performance and capacity
void testFlashWriteCapacity() {
  Serial.println("=== FLASH WRITE CAPACITY TEST ===");
  
  // Save current state
  int originalLogIndex = logIndex;
  
  // Test writing small entries to check for immediate issues
  int testWrites = 0;
  int failedWrites = 0;
  
  Serial.println("Testing flash write capacity...");
  
  for (int i = 0; i < 10; i++) {
    String testKey = "test_" + String(i);
    LogData testEntry;
    testEntry.timestamp = 1234567890 + i;
    testEntry.pm1_0_env = i;
    testEntry.pm2_5_env = i * 2;
    testEntry.pm10_0_env = i * 3;
    testEntry.battery_level = 50 + i;
    
    size_t result = preferences.putBytes(testKey.c_str(), &testEntry, sizeof(LogData));
    testWrites++;
    
    if (result == 0) {
      failedWrites++;
      Serial.println("❌ Test write " + String(i) + " failed");
    } else {
      Serial.println("✅ Test write " + String(i) + " succeeded (" + String(result) + " bytes)");
    }
    
    // Clean up test entry
    preferences.remove(testKey.c_str());
  }
  
  Serial.println("--- Test Results ---");
  Serial.println("Total test writes: " + String(testWrites));
  Serial.println("Failed writes: " + String(failedWrites));
  Serial.println("Success rate: " + String(((testWrites - failedWrites) * 100) / testWrites) + "%");
  
  if (failedWrites > 0) {
    Serial.println("❌ FLASH WRITE ISSUES DETECTED!");
    Serial.println("   Flash may be experiencing wear or corruption");
    Serial.println("   Consider reducing MAX_LOG_ENTRIES or clearing flash");
  } else {
    Serial.println("✅ Flash writes working normally");
  }
  
  // Calculate realistic capacity based on current free entries
  size_t freeEntries = preferences.freeEntries();
  size_t maxRealisticEntries = freeEntries / 3; // Conservative estimate (account for metadata)
  
  Serial.println("--- Realistic Capacity ---");
  Serial.println("Current free entries: " + String(freeEntries));
  Serial.println("Realistic max log entries: " + String(maxRealisticEntries));
  
  if (maxRealisticEntries < MAX_LOG_ENTRIES) {
    Serial.println("⚠️  WARNING: Current flash state cannot support " + String(MAX_LOG_ENTRIES) + " entries");
    Serial.println("   Recommended MAX_LOG_ENTRIES: " + String(maxRealisticEntries));
    Serial.println("   Current setting may cause write failures");
  } else {
    Serial.println("✅ Flash should support current MAX_LOG_ENTRIES setting");
  }
  
  Serial.println("===========================");
}
void restartAdvertising() {
  if (!bleInitialized || !pServer) {
    return;
  }
  
  try {
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    // Stop advertising (safe to call even if not advertising)
    pAdvertising->stop();
    vTaskDelay(pdMS_TO_TICKS(100)); // Use vTaskDelay instead of delay in FreeRTOS context
    
    // Restart advertising
    pAdvertising->start();
    lastAdvertisingStart = millis();
    Serial.println("BLE advertising restarted");
  } catch (...) {
    Serial.println("Failed to restart advertising");
  }
}

void checkBLEConnection() {
  unsigned long currentTime = millis();
  
  // Check connection status periodically
  if (currentTime - lastConnectionCheck >= CONNECTION_CHECK_INTERVAL) {
    lastConnectionCheck = currentTime;
    
    // If not connected and advertising hasn't been restarted recently
    if (!deviceConnected && 
        (currentTime - lastAdvertisingStart >= ADVERTISING_RESTART_INTERVAL)) {
      Serial.println("No connection for extended period, restarting advertising");
      restartAdvertising();
    }
  }
}

void safeBLEUpdate() {
  // Check if BLE is properly initialized and connected
  if (!bleInitialized || !deviceConnected || 
      !pLiveDataCharacteristic || !pBatteryCharacteristic) {
    return;
  }
  
  // Get latest sensor data safely
  SensorData latestData;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    latestData = sharedSensorData;
    xSemaphoreGive(dataMutex);
  } else {
    return; // Couldn't get mutex, skip update
  }
  
  try {
    // Update live data
    String liveData = String(latestData.pm1_0_env) + "," + 
                     String(latestData.pm2_5_env) + "," + 
                     String(latestData.pm10_0_env) + "," + 
                     String(latestData.battery_level);
    
    pLiveDataCharacteristic->setValue(liveData.c_str());
    
    // Only notify if the client is still connected
    if (deviceConnected) {
      pLiveDataCharacteristic->notify();
      
      // Update battery
      pBatteryCharacteristic->setValue(&latestData.battery_level, 1);
      pBatteryCharacteristic->notify();
      
      Serial.println("BLE characteristics updated successfully");
    }
    
  } catch (const std::exception& e) {
    Serial.println("Exception during BLE update: " + String(e.what()));
  } catch (...) {
    Serial.println("Unknown exception during BLE update");
    // Don't set error here as it might be temporary
  }
}

// BLE Task - runs on Core 0
void BLETask(void *pvParameters) {
  Serial.println("BLE Task starting on Core " + String(xPortGetCoreID()));
  
  // Initialize BLE on Core 0
  Serial.println("Initializing BLE...");
  bleInitialized = initBLE();
  
  if (!bleInitialized) {
    Serial.println("BLE initialization failed");
    lastError = ERROR_BLE_INIT_FAILED;
  } else {
    lastAdvertisingStart = millis();
    Serial.println("BLE initialized successfully on Core 0");
  }
  
  // BLE task main loop
  while (true) {
    if (bleInitialized) {
      // Check BLE connection status
      checkBLEConnection();
      
      // Update BLE characteristics if connected and new data is available
      if (deviceConnected && pServer && newDataAvailable) {
        safeBLEUpdate();
        newDataAvailable = false; // Reset flag
      }
      
      // Handle connection state changes
      if (bleInitialized && !deviceConnected && oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        Serial.println("Device disconnected, advertising will restart automatically");
      }
      
      if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        Serial.println("Device connected successfully");
      }
    }
    
    // BLE task runs every 100ms for responsive communication
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// Sensor Task - runs on Core 1
void SensorTask(void *pvParameters) {
  Serial.println("Sensor Task starting on Core " + String(xPortGetCoreID()));
  
  // Sensor task main loop
  while (true) {
    bool usbConnected = ums3.getVbusPresent();
    if (usbConnected) {
      ums3.setPixelBrightness(100);
    }

    SensorData newData;
    
    // Update battery level and timestamp
    newData.battery_level = getBatteryLevel();
    newData.timestamp = (uint32_t)getRTCTime(); // Use RTC time
    
    // Read sensor data with power management
    if (readPMSA003I(&newData)) {
      // Update LED based on air quality
      updateLEDStatus(newData);
      
      // Update shared data for BLE task
      updateSharedData(newData);
      
      // Save to Flash (only if RTC is synced)
      logDataToFlash(newData);
      
      if (usbConnected) {
        // Print to serial for debugging
        printSensorData(newData);
        Serial.println("USB power detected - staying awake");
        
        // Show RTC sync status in debug output and LED
        if (!rtcTimeAccurate) {
          Serial.println("⚠️  WARNING: RTC not accurate - data logging disabled");
          Serial.println("   Connect via BLE to sync time and enable logging");
          
          // Show time sync required pattern even when USB connected
          showTimeSyncRequired();
        } else {
          Serial.println("✅ RTC time accurate - logging enabled");
        }
      } else {
        // Battery powered - show time sync status via LED if needed
        if (!rtcTimeAccurate) {
          // Show time sync required pattern (blue pulse)
          showTimeSyncRequired();
        }
      }
      
    } else {
      Serial.println("Failed to read sensor data");
      showErrorBlink();
    }
    
    // Power management
    if (usbConnected) {
      // USB connected - stay awake and powered
      vTaskDelay(pdMS_TO_TICKS(TIME_TO_SLEEP * 1000));
    } else {
      // Battery powered - enter light sleep to save power
      // Turn off non-essential components
      ums3.setPixelPower(false);
      ums3.setLDO2Power(false);
      
      Serial.println("Running on battery - sensor task sleeping");
      
      // Sleep for the specified time
      vTaskDelay(pdMS_TO_TICKS(TIME_TO_SLEEP * 1000));
      
      // Restore components after sleep
      ums3.setPixelPower(true);
      ums3.setPixelBrightness(100);

      // Reinitalize sensor after power cycle
      delay(3000); // Wait for sensor to boot up (Adafruit library recommends 3 seconds)
      initPMSA003I();
    }
  }
}

// Thread-safe function to update shared sensor data
void updateSharedData(SensorData newData) {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    sharedSensorData = newData;
    newDataAvailable = true;
    xSemaphoreGive(dataMutex);
  }
}

// RTC Time Management Functions
void initRTC() {
  Serial.println("=== RTC Initialization ===");
  
  // After any reset/power loss, time is NOT accurate until BLE sync
  rtcTimeAccurate = false;
  rtcTimeSet = false;
  
  Serial.println("RTC initialized with system default time");
  Serial.println("⚠️  TIME NOT ACCURATE - requires BLE sync");
  Serial.println("⚠️  DATA LOGGING DISABLED - waiting for time sync");
  Serial.println("Current system time: " + formatRTCTime(getRTCTime()));
  Serial.println("===========================");
}

void setRTCTime(time_t epochTime) {
  struct timeval tv;
  tv.tv_sec = epochTime;
  tv.tv_usec = 0;
  settimeofday(&tv, NULL);
  
  rtcTimeSet = true;
  
  Serial.println("RTC time set to: " + String((unsigned long)epochTime) + " (" + formatRTCTime(epochTime) + ")");
}

void setRTCTimeFromBLE(time_t epochTime) {
  setRTCTime(epochTime);
  
  bool wasTimeAccurate = rtcTimeAccurate;
  rtcTimeAccurate = true; // Only set to true for BLE sync
  
  Serial.println("✅ RTC TIME SYNCED VIA BLE - time is now accurate!");
  
  // Show logging status change
  if (!wasTimeAccurate) {
    Serial.println("✅ DATA LOGGING NOW ENABLED - RTC time synced!");
    
    // Visual confirmation - green flash to show sync success
    for (int i = 0; i < 3; i++) {
      ums3.setPixelColor(0, 255, 0); // Green
      delay(200);
      ums3.setPixelColor(0, 0, 0); // Off
      delay(200);
    }
  }
}

time_t getRTCTime() {
  if (!rtcTimeSet) {
    // If RTC hasn't been set, return a reasonable default (millis-based timestamp)
    // This ensures we always have a timestamp, even if not synced
    return 1609459200 + (millis() / 1000); // Jan 1, 2021 + uptime
  }
  
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return tv.tv_sec;
}

String formatRTCTime(time_t timestamp) {
  struct tm *timeinfo = localtime(&timestamp);
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", timeinfo);
  return String(buffer);
}

void debugLogEntries() {
  Serial.println("=== DEBUG LOG ENTRIES ===");
  Serial.println("Current logIndex: " + String(logIndex));
  Serial.println("MAX_LOG_ENTRIES: " + String(MAX_LOG_ENTRIES));
  
  int startIndex = max(0, logIndex - MAX_LOG_ENTRIES);
  int endIndex = logIndex;
  
  Serial.println("Should read range: " + String(startIndex) + " to " + String(endIndex - 1));
  Serial.println("Total entries to send: " + String(min(logIndex, MAX_LOG_ENTRIES)));
  Serial.println("Circular buffer status: " + String(logIndex >= MAX_LOG_ENTRIES ? "WRAPPED" : "LINEAR"));
  
  int found = 0;
  int missing = 0;
  
  // Show first 10 and last 10 entries that should exist
  Serial.println("--- First 10 entries in range ---");
  for (int i = startIndex; i < min(startIndex + 10, endIndex); i++) {
    String key = "log" + String(i % MAX_LOG_ENTRIES);
    LogData logEntry;
    
    size_t bytesRead = preferences.getBytes(key.c_str(), &logEntry, sizeof(LogData));
    if (bytesRead == sizeof(LogData)) {
      Serial.println("Entry " + String(i) + " (key:" + key + "): " + String(logEntry.timestamp) + "," +
                    String(logEntry.pm1_0_env) + "," + String(logEntry.pm2_5_env) + "," +
                    String(logEntry.pm10_0_env) + "," + String(logEntry.battery_level));
      found++;
    } else {
      Serial.println("Entry " + String(i) + " (key:" + key + "): NOT FOUND (" + String(bytesRead) + " bytes)");
      missing++;
    }
  }
  
  if (endIndex - startIndex > 20) {
    Serial.println("--- Last 10 entries in range ---");
    for (int i = max(startIndex + 10, endIndex - 10); i < endIndex; i++) {
      String key = "log" + String(i % MAX_LOG_ENTRIES);
      LogData logEntry;
      
      size_t bytesRead = preferences.getBytes(key.c_str(), &logEntry, sizeof(LogData));
      if (bytesRead == sizeof(LogData)) {
        Serial.println("Entry " + String(i) + " (key:" + key + "): " + String(logEntry.timestamp) + "," +
                      String(logEntry.pm1_0_env) + "," + String(logEntry.pm2_5_env) + "," +
                      String(logEntry.pm10_0_env) + "," + String(logEntry.battery_level));
        found++;
      } else {
        Serial.println("Entry " + String(i) + " (key:" + key + "): NOT FOUND (" + String(bytesRead) + " bytes)");
        missing++;
      }
    }
  }
  
  Serial.println("Summary: " + String(found) + " found, " + String(missing) + " missing in sample");
  Serial.println("=== END DEBUG ===");
}

void showTimeSyncRequired() {
  // Distinctive pattern: Slow blue pulse to indicate time sync needed
  // Blue color indicates "waiting for connection/sync"
  for (int brightness = 0; brightness <= 100; brightness += 5) {
    ums3.setPixelColor(0, 0, brightness * 255 / 100); // Blue fade in
    delay(30);
  }
  for (int brightness = 100; brightness >= 0; brightness -= 5) {
    ums3.setPixelColor(0, 0, brightness * 255 / 100); // Blue fade out
    delay(30);
  }
  delay(500); // Pause between pulses
}

// Emergency flash repair function
void repairFlashStorage() {
  Serial.println("Performing emergency flash repair...");
  
  // Clear all old-format entries
  for (int i = 0; i < MAX_LOG_ENTRIES; i++) {
    String oldKey = "log_" + String(i);
    if (preferences.remove(oldKey.c_str())) {
      Serial.println("Removed legacy entry: " + oldKey);
    }
  }
  
  // Reset log index to prevent corruption
  logIndex = 0;
  preferences.putInt("logIndex", 0);
  
  Serial.println("Flash repair completed");
}

void printSensorData(SensorData data) {
  Serial.println("=== Air Quality Reading ===");
  Serial.println("Concentration Units (standard):");
  Serial.println("PM1.0: " + String(data.pm1_0_standard) + " µg/m³");
  Serial.println("PM2.5: " + String(data.pm2_5_standard) + " µg/m³");
  Serial.println("PM10: " + String(data.pm10_0_standard) + " µg/m³");
  Serial.println("Concentration Units (environmental):");
  Serial.println("PM1.0: " + String(data.pm1_0_env) + " µg/m³");
  Serial.println("PM2.5: " + String(data.pm2_5_env) + " µg/m³");
  Serial.println("PM10: " + String(data.pm10_0_env) + " µg/m³");
  Serial.println("Particle counts per 0.1L air:");
  Serial.println(">0.3µm: " + String(data.particles_03um));
  Serial.println(">0.5µm: " + String(data.particles_05um));
  Serial.println(">1.0µm: " + String(data.particles_10um));
  Serial.println(">2.5µm: " + String(data.particles_25um));
  Serial.println(">5.0µm: " + String(data.particles_50um));
  Serial.println(">10µm: " + String(data.particles_100um));
  Serial.println("Battery: " + String(data.battery_level) + "%");
  Serial.println("Timestamp: " + String(data.timestamp));
  Serial.println("Power mode: " + String(lowPowerMode ? "low power" : "responsive"));
  Serial.println("Core: " + String(xPortGetCoreID()));
  Serial.println("==========================");
}

void showErrorBlink() {
  // Display error based on last error code
  Serial.print("Error detected: ");
  
  switch (lastError) {
    case ERROR_SENSOR_NOT_FOUND:
      Serial.println("Sensor not found on I2C bus");
      // Blink red 3 times (short blinks)
      for (int i = 0; i < 3; i++) {
        ums3.setPixelColor(255, 0, 0);
        delay(200);
        ums3.setPixelColor(0, 0, 0);
        delay(200);
      }
      break;
      
    case ERROR_SENSOR_TIMEOUT:
      Serial.println("Sensor communication timeout");
      // Blink red 5 times (fast blinks)
      for (int i = 0; i < 5; i++) {
        ums3.setPixelColor(255, 0, 0);
        delay(150);
        ums3.setPixelColor(0, 0, 0);
        delay(150);
      }
      break;
      
    case ERROR_INVALID_DATA:
      Serial.println("Invalid data received from sensor");
      // Blink red and blue alternately (data corruption)
      for (int i = 0; i < 4; i++) {
        ums3.setPixelColor(255, 0, 0);
        delay(250);
        ums3.setPixelColor(0, 0, 255);
        delay(250);
      }
      ums3.setPixelColor(0, 0, 0);
      break;
      
    case ERROR_BLE_INIT_FAILED:
      Serial.println("BLE initialization failed");
      // Blink cyan 3 times (BLE/communication error)
      for (int i = 0; i < 3; i++) {
        ums3.setPixelColor(0, 255, 255);
        delay(400);
        ums3.setPixelColor(0, 0, 0);
        delay(400);
      }
      break;
      
    case ERROR_FLASH_WRITE_FAILED:
      Serial.println("Flash write failed");
      // Blink yellow 3 times (storage error)
      for (int i = 0; i < 3; i++) {
        ums3.setPixelColor(255, 255, 0);
        delay(400);
        ums3.setPixelColor(0, 0, 0);
        delay(400);
      }
      break;
      
    default:
      Serial.println("Unknown error");
      // Blink white 3 times (unknown error)
      for (int i = 0; i < 3; i++) {
        ums3.setPixelColor(255, 255, 255);
        delay(300);
        ums3.setPixelColor(0, 0, 0);
        delay(300);
      }
      break;
  }
  
  // Brief pause after error indication
  delay(1000);
}

// ============================================================================
// LittleFS Storage Implementation
// ============================================================================

bool initLittleFS() {
  Serial.println("🔧 Initializing LittleFS filesystem...");
  
  if (!LittleFS.begin(true)) { // true = format on first use
    Serial.println("❌ LittleFS mount failed");
    return false;
  }
  
  Serial.println("✅ LittleFS mounted successfully");
  
  // Create logs directory if it doesn't exist
  if (!LittleFS.exists("/logs")) {
    if (LittleFS.mkdir("/logs")) {
      Serial.println("📁 Created /logs directory");
    } else {
      Serial.println("❌ Failed to create /logs directory");
      return false;
    }
  }
  
  // Create a metadata file to track log index
  if (!LittleFS.exists("/logs/metadata.txt")) {
    File metaFile = LittleFS.open("/logs/metadata.txt", "w");
    if (metaFile) {
      metaFile.println("0"); // Initialize log index to 0
      metaFile.close();
      Serial.println("📄 Created metadata file");
    } else {
      Serial.println("❌ Failed to create metadata file");
      return false;
    }
  }
  
  return true;
}

void printLittleFSInfo() {
  Serial.println("\n📊 LittleFS Filesystem Information:");
  Serial.println("=====================================");
  
  size_t totalBytes = LittleFS.totalBytes();
  size_t usedBytes = LittleFS.usedBytes();
  size_t freeBytes = totalBytes - usedBytes;
  
  Serial.printf("LittleFS partition size: %u bytes (%.2f MB)\n", totalBytes, totalBytes / (1024.0 * 1024.0));
  Serial.printf("Used space:  %u bytes (%.2f MB)\n", usedBytes, usedBytes / (1024.0 * 1024.0));
  Serial.printf("Free space:  %u bytes (%.2f MB)\n", freeBytes, freeBytes / (1024.0 * 1024.0));
  Serial.printf("Usage:       %.1f%%\n", (usedBytes * 100.0) / totalBytes);
  
  // Show relationship to total flash
  size_t flashChipSize = ESP.getFlashChipSize();
  float partitionPercent = (totalBytes * 100.0) / flashChipSize;
  Serial.printf("LittleFS uses %.1f%% of total %u MB flash chip\n", 
                partitionPercent, (uint32_t)(flashChipSize / (1024 * 1024)));
  
  // Calculate storage capacity for log entries
  size_t entrySize = sizeof(LogData); // 11 bytes per entry
  size_t maxEntries = freeBytes / entrySize;
  size_t storageForTarget = 100000 * entrySize; // 100k entries target
  size_t storageForMegaTarget = 1000000 * entrySize; // 1M entries ambitious target
  
  Serial.println("\n📈 Log Storage Capacity Analysis:");
  Serial.printf("Entry size: %u bytes\n", entrySize);
  Serial.printf("Max entries with current free space: %u\n", maxEntries);
  Serial.printf("Storage needed for 100,000 entries: %.2f MB\n", storageForTarget / (1024.0 * 1024.0));
  Serial.printf("Storage needed for 1,000,000 entries: %.2f MB\n", storageForMegaTarget / (1024.0 * 1024.0));
  
  if (freeBytes >= storageForMegaTarget) {
    Serial.println("🚀 EXCELLENT: Space for 1,000,000+ log entries!");
    Serial.printf("   Could store %.1f years of data at 1 reading/minute\n", 
                  (maxEntries / (365.0 * 24.0 * 60.0)));
  } else if (freeBytes >= storageForTarget) {
    Serial.println("✅ GREAT: Space for 100,000+ log entries!");
    Serial.printf("   Could store %.1f years of data at 1 reading/minute\n", 
                  (maxEntries / (365.0 * 24.0 * 60.0)));
  } else {
    Serial.printf("⚠️  LIMITED: Space for %u entries (%.1f%% of 100k target)\n", 
                  maxEntries, (maxEntries * 100.0) / 100000);
    Serial.printf("   Could store %.1f days of data at 1 reading/minute\n", 
                  (maxEntries / (24.0 * 60.0)));
  }
  
  // File system efficiency analysis
  Serial.println("\n📁 File System Efficiency:");
  Serial.printf("Raw data efficiency: %.1f%% (%.2f MB usable vs %.2f MB partition)\n",
                (freeBytes * 100.0) / totalBytes, 
                freeBytes / (1024.0 * 1024.0), 
                totalBytes / (1024.0 * 1024.0));
  
  // Show directory structure if logs exist
  if (LittleFS.exists("/logs")) {
    File logsDir = LittleFS.open("/logs");
    if (logsDir && logsDir.isDirectory()) {
      int dirCount = 0;
      int fileCount = 0;
      
      File entry = logsDir.openNextFile();
      while (entry) {
        if (entry.isDirectory()) {
          dirCount++;
        } else {
          fileCount++;
        }
        entry.close();
        entry = logsDir.openNextFile();
      }
      logsDir.close();
      
      Serial.printf("Current log structure: %d directories, %d files\n", dirCount, fileCount);
    }
  }
  
  Serial.println("=====================================\n");
}

String getLittleFSLogPath(int index) {
  // Organize logs in subdirectories to avoid too many files in one directory
  int dirIndex = index / 1000; // 1000 logs per directory
  int fileIndex = index % 1000;
  return "/logs/" + String(dirIndex) + "/" + String(fileIndex) + ".log";
}

void saveLogToLittleFS(const LogData& logEntry) {
  String logPath = getLittleFSLogPath(logIndex);
  String dirPath = logPath.substring(0, logPath.lastIndexOf('/'));
  
  // Create directory if it doesn't exist
  if (!LittleFS.exists(dirPath)) {
    if (!LittleFS.mkdir(dirPath)) {
      Serial.println("❌ Failed to create log directory: " + dirPath);
      lastError = ERROR_FLASH_WRITE_FAILED;
      return;
    }
  }
  
  // Write log entry
  File logFile = LittleFS.open(logPath, "w");
  if (!logFile) {
    Serial.println("❌ Failed to create log file: " + logPath);
    lastError = ERROR_FLASH_WRITE_FAILED;
    return;
  }
  
  size_t bytesWritten = logFile.write((const uint8_t*)&logEntry, sizeof(LogData));
  logFile.close();
  
  if (bytesWritten != sizeof(LogData)) {
    Serial.println("❌ Failed to write complete log entry");
    lastError = ERROR_FLASH_WRITE_FAILED;
    return;
  }
  
  // Update log index
  logIndex++;
  
  // Update metadata file
  File metaFile = LittleFS.open("/logs/metadata.txt", "w");
  if (metaFile) {
    metaFile.println(logIndex);
    metaFile.close();
  }
  
  Serial.printf("✅ Saved log entry %d to LittleFS\n", logIndex - 1);
}

LogData readLogFromLittleFS(int index) {
  LogData logEntry = {0}; // Initialize with zeros
  
  String logPath = getLittleFSLogPath(index);
  
  if (!LittleFS.exists(logPath)) {
    Serial.println("⚠️  Log file not found: " + logPath);
    return logEntry;
  }
  
  File logFile = LittleFS.open(logPath, "r");
  if (!logFile) {
    Serial.println("❌ Failed to open log file: " + logPath);
    return logEntry;
  }
  
  size_t bytesRead = logFile.read((uint8_t*)&logEntry, sizeof(LogData));
  logFile.close();
  
  if (bytesRead != sizeof(LogData)) {
    Serial.printf("⚠️  Partial read from log file %s: %u/%u bytes\n", 
                  logPath.c_str(), bytesRead, sizeof(LogData));
  }
  
  return logEntry;
}

void migrateLegacyData() {
  Serial.println("🔄 Starting migration from Preferences to LittleFS...");
  
  int legacyLogIndex = preferences.getInt("logIndex", 0);
  if (legacyLogIndex <= 0) {
    Serial.println("ℹ️  No legacy data to migrate");
    return;
  }
  
  Serial.printf("📦 Found %d legacy log entries to migrate\n", legacyLogIndex);
  
  int migratedCount = 0;
  int errorCount = 0;
  
  for (int i = 0; i < legacyLogIndex; i++) {
    String key = "log_" + String(i);
    LogData legacyData;
    
    size_t bytesRead = preferences.getBytes(key.c_str(), &legacyData, sizeof(LogData));
    
    if (bytesRead == sizeof(LogData)) {
      // Save to LittleFS using the existing logIndex
      String logPath = getLittleFSLogPath(logIndex);
      String dirPath = logPath.substring(0, logPath.lastIndexOf('/'));
      
      // Create directory if needed
      if (!LittleFS.exists(dirPath)) {
        LittleFS.mkdir(dirPath);
      }
      
      File logFile = LittleFS.open(logPath, "w");
      if (logFile) {
        if (logFile.write((const uint8_t*)&legacyData, sizeof(LogData)) == sizeof(LogData)) {
          logFile.close();
          logIndex++;
          migratedCount++;
          
          // Remove from preferences to free space
          preferences.remove(key.c_str());
        } else {
          logFile.close();
          errorCount++;
          Serial.printf("❌ Failed to write migrated entry %d\n", i);
        }
      } else {
        errorCount++;
        Serial.printf("❌ Failed to create LittleFS file for entry %d\n", i);
      }
    } else {
      // Try legacy format
      String oldKey = "data_" + String(i);
      SensorData legacySensorData;
      size_t legacyBytesRead = preferences.getBytes(oldKey.c_str(), &legacySensorData, sizeof(SensorData));
      
      if (legacyBytesRead == sizeof(SensorData)) {
        // Convert to new format
        LogData convertedData;
        convertedData.timestamp = legacySensorData.timestamp;
        convertedData.pm1_0_env = legacySensorData.pm1_0_env;
        convertedData.pm2_5_env = legacySensorData.pm2_5_env;
        convertedData.pm10_0_env = legacySensorData.pm10_0_env;
        convertedData.battery_level = legacySensorData.battery_level;
        
        // Save converted data
        String logPath = getLittleFSLogPath(logIndex);
        String dirPath = logPath.substring(0, logPath.lastIndexOf('/'));
        
        if (!LittleFS.exists(dirPath)) {
          LittleFS.mkdir(dirPath);
        }
        
        File logFile = LittleFS.open(logPath, "w");
        if (logFile) {
          if (logFile.write((const uint8_t*)&convertedData, sizeof(LogData)) == sizeof(LogData)) {
            logFile.close();
            logIndex++;
            migratedCount++;
            
            // Remove from preferences
            preferences.remove(oldKey.c_str());
          } else {
            logFile.close();
            errorCount++;
          }
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
        Serial.printf("⚠️  Could not read legacy entry %d\n", i);
      }
    }
  }
  
  // Update metadata
  File metaFile = LittleFS.open("/logs/metadata.txt", "w");
  if (metaFile) {
    metaFile.println(logIndex);
    metaFile.close();
  }
  
  // Update preferences to reflect new log index
  preferences.putInt("logIndex", logIndex);
  
  Serial.printf("✅ Migration complete: %d entries migrated, %d errors\n", migratedCount, errorCount);
  
  if (migratedCount > 0) {
    useLittleFS = true;
    Serial.println("🎉 LittleFS is now the active storage system");
  }
}

void clearLogsLittleFS() {
  Serial.println("🗑️  Clearing all LittleFS logs...");
  
  // Remove all log directories
  File root = LittleFS.open("/logs");
  if (root && root.isDirectory()) {
    File file = root.openNextFile();
    while (file) {
      if (file.isDirectory()) {
        String dirName = file.name();
        file.close();
        
        // Remove all files in this directory
        File dir = LittleFS.open("/logs/" + dirName);
        if (dir && dir.isDirectory()) {
          File logFile = dir.openNextFile();
          while (logFile) {
            String fileName = logFile.name();
            logFile.close();
            LittleFS.remove("/logs/" + dirName + "/" + fileName);
            logFile = dir.openNextFile();
          }
          dir.close();
        }
        
        // Remove the directory
        LittleFS.rmdir("/logs/" + dirName);
      } else {
        String fileName = file.name();
        file.close();
        LittleFS.remove("/logs/" + fileName);
      }
      file = root.openNextFile();
    }
    root.close();
  }
  
  // Reset metadata
  File metaFile = LittleFS.open("/logs/metadata.txt", "w");
  if (metaFile) {
    metaFile.println("0");
    metaFile.close();
  }
  
  logIndex = 0;
  preferences.putInt("logIndex", 0);
  
  Serial.println("✅ All logs cleared from LittleFS");
}

void optimizeLittleFSStorage() {
  Serial.println("🔧 Optimizing LittleFS storage...");
  
  // Count existing log files and check for gaps
  int actualFiles = 0;
  int maxIndex = 0;
  
  for (int i = 0; i < logIndex; i++) {
    String logPath = getLittleFSLogPath(i);
    if (LittleFS.exists(logPath)) {
      actualFiles++;
      maxIndex = i;
    }
  }
  
  Serial.printf("📊 Found %d actual files, max index: %d, recorded index: %d\n", 
                actualFiles, maxIndex, logIndex);
  
  // Update logIndex to reflect actual state
  if (maxIndex + 1 != logIndex) {
    logIndex = maxIndex + 1;
    File metaFile = LittleFS.open("/logs/metadata.txt", "w");
    if (metaFile) {
      metaFile.println(logIndex);
      metaFile.close();
    }
    preferences.putInt("logIndex", logIndex);
    Serial.printf("🔄 Updated log index to %d\n", logIndex);
  }
  
  Serial.println("✅ LittleFS optimization complete");
}

void analyzeSystemMemory() {
  Serial.println("\n🔍 COMPREHENSIVE SYSTEM MEMORY ANALYSIS");
  Serial.println("=========================================");
  
  // Flash chip information
  Serial.println("--- Flash Chip Details ---");
  size_t flashChipSize = ESP.getFlashChipSize();
  uint32_t flashChipSpeed = ESP.getFlashChipSpeed();
  uint32_t flashChipMode = ESP.getFlashChipMode();
  
  Serial.printf("Flash Type: ESP32-S3 QSPI Flash\n");
  Serial.printf("Total Capacity: %u bytes (%.1f MB)\n", flashChipSize, flashChipSize / (1024.0 * 1024.0));
  Serial.printf("Speed: %u Hz (%.1f MHz)\n", flashChipSpeed, flashChipSpeed / 1000000.0);
  Serial.print("Mode: ");
  switch(flashChipMode) {
    case 0: Serial.println("QIO (Quad I/O)"); break;
    case 1: Serial.println("QOUT (Quad Output)"); break; 
    case 2: Serial.println("DIO (Dual I/O)"); break;
    case 3: Serial.println("DOUT (Dual Output)"); break;
    default: Serial.println("Unknown (" + String(flashChipMode) + ")"); break;
  }
  
  // RAM information
  Serial.println("\n--- RAM Usage ---");
  size_t totalHeap = ESP.getHeapSize();
  size_t freeHeap = ESP.getFreeHeap();
  size_t usedHeap = totalHeap - freeHeap;
  size_t maxAllocHeap = ESP.getMaxAllocHeap();
  size_t minFreeHeap = ESP.getMinFreeHeap();
  
  Serial.printf("Total RAM: %u bytes (%.1f KB)\n", totalHeap, totalHeap / 1024.0);
  Serial.printf("Used RAM: %u bytes (%.1f KB, %.1f%%)\n", 
                usedHeap, usedHeap / 1024.0, (usedHeap * 100.0) / totalHeap);
  Serial.printf("Free RAM: %u bytes (%.1f KB, %.1f%%)\n", 
                freeHeap, freeHeap / 1024.0, (freeHeap * 100.0) / totalHeap);
  Serial.printf("Largest allocatable block: %u bytes (%.1f KB)\n", 
                maxAllocHeap, maxAllocHeap / 1024.0);
  Serial.printf("Minimum free heap since boot: %u bytes (%.1f KB)\n", 
                minFreeHeap, minFreeHeap / 1024.0);
  
  // PSRAM information (ESP32-S3 may have PSRAM)
  if (ESP.getPsramSize() > 0) {
    Serial.println("\n--- PSRAM (External RAM) ---");
    size_t totalPsram = ESP.getPsramSize();
    size_t freePsram = ESP.getFreePsram();
    size_t usedPsram = totalPsram - freePsram;
    
    Serial.printf("Total PSRAM: %u bytes (%.1f MB)\n", totalPsram, totalPsram / (1024.0 * 1024.0));
    Serial.printf("Used PSRAM: %u bytes (%.1f MB, %.1f%%)\n", 
                  usedPsram, usedPsram / (1024.0 * 1024.0), (usedPsram * 100.0) / totalPsram);
    Serial.printf("Free PSRAM: %u bytes (%.1f MB, %.1f%%)\n", 
                  freePsram, freePsram / (1024.0 * 1024.0), (freePsram * 100.0) / totalPsram);
  } else {
    Serial.println("\n--- PSRAM ---");
    Serial.println("No PSRAM detected");
  }
  
  // Flash partition usage
  Serial.println("\n--- Flash Partition Usage ---");
  size_t sketchSize = ESP.getSketchSize();
  size_t freeSketchSpace = ESP.getFreeSketchSpace();
  size_t totalSketchSpace = sketchSize + freeSketchSpace;
  
  Serial.printf("App Partition: %u bytes (%.2f MB)\n", totalSketchSpace, totalSketchSpace / (1024.0 * 1024.0));
  Serial.printf("  Current sketch: %u bytes (%.2f MB, %.1f%%)\n", 
                sketchSize, sketchSize / (1024.0 * 1024.0), 
                (sketchSize * 100.0) / totalSketchSpace);
  Serial.printf("  Available for OTA: %u bytes (%.2f MB, %.1f%%)\n", 
                freeSketchSpace, freeSketchSpace / (1024.0 * 1024.0),
                (freeSketchSpace * 100.0) / totalSketchSpace);
  
  // Estimate other partitions
  size_t accountedFlash = totalSketchSpace;
  if (useLittleFS) {
    size_t littleFSSize = LittleFS.totalBytes();
    accountedFlash += littleFSSize;
    Serial.printf("LittleFS Partition: %u bytes (%.2f MB, %.1f%% of flash)\n", 
                  littleFSSize, littleFSSize / (1024.0 * 1024.0),
                  (littleFSSize * 100.0) / flashChipSize);
  }
  
  size_t unaccountedFlash = flashChipSize - accountedFlash;
  Serial.printf("Other partitions: ~%u bytes (%.2f MB, %.1f%%)\n", 
                unaccountedFlash, unaccountedFlash / (1024.0 * 1024.0),
                (unaccountedFlash * 100.0) / flashChipSize);
  Serial.println("  (bootloader, NVS, system partitions, etc.)");
  
  // Data logging capacity analysis
  Serial.println("\n--- Data Logging Capacity ---");
  size_t entrySize = sizeof(LogData);
  Serial.printf("Log entry size: %u bytes\n", entrySize);
  
  if (useLittleFS) {
    size_t availableSpace = LittleFS.totalBytes() - LittleFS.usedBytes();
    size_t maxEntries = availableSpace / entrySize;
    Serial.printf("Available LittleFS space: %.2f MB\n", availableSpace / (1024.0 * 1024.0));
    Serial.printf("Max log entries: %u\n", maxEntries);
    
    // Time calculations
    float yearsAt1Min = maxEntries / (365.0 * 24.0 * 60.0);
    float yearsAt10Min = maxEntries / (365.0 * 24.0 * 6.0);
    float yearsAt1Hour = maxEntries / (365.0 * 24.0);
    
    Serial.printf("Storage duration at different intervals:\n");
    Serial.printf("  1 reading/minute: %.1f years\n", yearsAt1Min);
    Serial.printf("  1 reading/10 minutes: %.1f years\n", yearsAt10Min);  
    Serial.printf("  1 reading/hour: %.1f years\n", yearsAt1Hour);
  } else {
    Serial.println("Using NVS/Preferences - limited capacity");
    Serial.printf("Estimated max entries: ~%d (limited by NVS partition)\n", MAX_LOG_ENTRIES);
  }
  
  // Current system status
  Serial.println("\n--- Current System Status ---");
  Serial.printf("CPU frequency: %u MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("Uptime: %lu seconds (%.1f hours)\n", 
                millis() / 1000, (millis() / 1000) / 3600.0);
  Serial.printf("Reset reason: ");
  esp_reset_reason_t resetReason = esp_reset_reason();
  switch (resetReason) {
    case ESP_RST_POWERON: Serial.println("Power on"); break;
    case ESP_RST_EXT: Serial.println("External reset"); break;
    case ESP_RST_SW: Serial.println("Software reset"); break;
    case ESP_RST_PANIC: Serial.println("Exception/panic"); break;
    case ESP_RST_INT_WDT: Serial.println("Interrupt watchdog"); break;
    case ESP_RST_TASK_WDT: Serial.println("Task watchdog"); break;
    case ESP_RST_WDT: Serial.println("Other watchdog"); break;
    case ESP_RST_DEEPSLEEP: Serial.println("Deep sleep wake"); break;
    case ESP_RST_BROWNOUT: Serial.println("Brownout"); break;
    case ESP_RST_SDIO: Serial.println("SDIO reset"); break;
    default: Serial.println("Unknown"); break;
  }
  
  Serial.printf("Active storage system: %s\n", useLittleFS ? "LittleFS" : "NVS/Preferences");
  Serial.printf("Current log index: %d\n", logIndex);
  Serial.printf("RTC time accurate: %s\n", rtcTimeAccurate ? "Yes" : "No");
  Serial.printf("BLE initialized: %s\n", bleInitialized ? "Yes" : "No");
  Serial.printf("Device connected: %s\n", deviceConnected ? "Yes" : "No");
  
  Serial.println("=========================================\n");
}


