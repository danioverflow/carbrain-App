const DEMO_DEVICES = [
  { id: "demo-veepeak", name: "Veepeak OBDCheck BLE+" },
  { id: "demo-vgate", name: "Vgate iCar Pro BLE" },
  { id: "demo-generic", name: "OBDII ELM327 (BLE)" },
];

const DEMO_DTC_SETS = [
  [],
  ["P0420"],
  ["P0171", "P0301"],
  ["P0442"],
  ["P0300", "P0301", "P0304"],
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class DemoAdapter {
  constructor() {
    this.connected = false;
    this.deviceName = null;
    this.liveInterval = null;
    this._live = {
      rpm: 820,
      speed: 0,
      coolantTemp: 88,
      intakeTemp: 24,
      throttle: 12,
      fuelLevel: 62,
      voltage: 14.1,
      manifoldPressure: 32,
    };
  }

  async scan() {
    await wait(900);
    return DEMO_DEVICES;
  }

  async connect(device) {
    await wait(1200);
    this.connected = true;
    this.deviceName = device?.name || "Demo-Adapter";
    return { deviceName: this.deviceName, protocol: "ISO 15765-4 (CAN, 11 Bit, 500 kbaud) – simuliert" };
  }

  disconnect() {
    this.connected = false;
    this.deviceName = null;
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.liveInterval = null;
  }

  async readDTCs() {
    await wait(1100);
    return randomFrom(DEMO_DTC_SETS);
  }

  startLiveData(onUpdate) {
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.liveInterval = setInterval(() => {
      this._live.rpm = clamp(this._live.rpm + rand(-40, 60), 750, 3200);
      this._live.speed = clamp(this._live.speed + rand(-3, 4), 0, 140);
      this._live.coolantTemp = clamp(this._live.coolantTemp + rand(-0.3, 0.3), 82, 96);
      this._live.intakeTemp = clamp(this._live.intakeTemp + rand(-0.2, 0.2), 15, 40);
      this._live.throttle = clamp(this._live.throttle + rand(-4, 6), 0, 90);
      this._live.fuelLevel = clamp(this._live.fuelLevel - 0.01, 5, 100);
      this._live.voltage = clamp(this._live.voltage + rand(-0.05, 0.05), 12.8, 14.6);
      this._live.manifoldPressure = clamp(this._live.manifoldPressure + rand(-2, 2), 25, 100);
      onUpdate({ ...this._live });
    }, 1000);
  }

  stopLiveData() {
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.liveInterval = null;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
