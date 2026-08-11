const KNOWN_SERVICE_PROFILES = [
  {
    name: "Nordic UART Service",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
  {
    name: "Generic OBD BLE (FFF0)",
    service: "0000fff0-0000-1000-8000-00805f9b34fb",
    write: "0000fff2-0000-1000-8000-00805f9b34fb",
    notify: "0000fff1-0000-1000-8000-00805f9b34fb",
  },
];

export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class BleObdAdapter {
  constructor() {
    this.device = null;
    this.server = null;
    this.writeChar = null;
    this.notifyChar = null;
    this._buffer = "";
    this._pending = null;
    this.liveTimer = null;
    this.onDisconnected = null;
  }

  async requestDevice() {
    if (!isWebBluetoothSupported()) {
      throw new Error("Web Bluetooth wird von diesem Browser nicht unterstützt.");
    }
    const optionalServices = KNOWN_SERVICE_PROFILES.map((p) => p.service);
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    });
    this.device.addEventListener("gattserverdisconnected", () => {
      this._cleanup();
      if (this.onDisconnected) this.onDisconnected();
    });
    return { id: this.device.id, name: this.device.name || "Unbekanntes Gerät" };
  }

  async connect() {
    if (!this.device) throw new Error("Kein Gerät ausgewählt.");
    this.server = await this.device.gatt.connect();

    let matchedProfile = null;
    for (const profile of KNOWN_SERVICE_PROFILES) {
      try {
        const service = await this.server.getPrimaryService(profile.service);
        const writeChar = await service.getCharacteristic(profile.write);
        const notifyChar = await service.getCharacteristic(profile.notify);
        this.writeChar = writeChar;
        this.notifyChar = notifyChar;
        matchedProfile = profile;
        break;
      } catch {
        // dieses Profil passt nicht zu diesem Adapter – nächstes probieren
      }
    }

    if (!matchedProfile) {
      throw new Error(
        "Kein passendes Bluetooth-Profil für diesen Adapter gefunden. Das Gerät nutzt möglicherweise eine nicht unterstützte GATT-Konfiguration."
      );
    }

    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener("characteristicvaluechanged", (e) => this._onData(e));

    await this._sendCommand("ATZ", 2000);
    await this._sendCommand("ATE0");
    await this._sendCommand("ATL0");
    await this._sendCommand("ATH0");
    await this._sendCommand("ATSP0");
    const test = await this._sendCommand("0100");
    if (/NO DATA|UNABLE|ERROR/.test(test)) {
      throw new Error("Adapter antwortet, aber es kommt keine Verbindung zum Fahrzeug-Steuergerät zustande. Zündung eingeschaltet?");
    }

    return { deviceName: this.device.name || "OBD2-Adapter", profile: matchedProfile.name };
  }

  disconnect() {
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } finally {
      this._cleanup();
    }
  }

  _cleanup() {
    this.stopLiveData();
    this.server = null;
    this.writeChar = null;
    this.notifyChar = null;
    this._buffer = "";
  }

  _onData(event) {
    const value = event.target.value;
    const text = new TextDecoder().decode(value);
    this._buffer += text;
    if (this._buffer.includes(">")) {
      const response = this._buffer;
      this._buffer = "";
      if (this._pending) {
        this._pending.resolve(response);
        this._pending = null;
      }
    }
  }

  async _sendCommand(command, timeoutMs = 4000) {
    if (!this.writeChar) throw new Error("Nicht verbunden.");
    const payload = new TextEncoder().encode(command + "\r");
    const responsePromise = new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      setTimeout(() => {
        if (this._pending) {
          this._pending = null;
          reject(new Error(`Zeitüberschreitung bei Befehl "${command}".`));
        }
      }, timeoutMs);
    });
    try {
      await this.writeChar.writeValueWithoutResponse(payload);
    } catch {
      await this.writeChar.writeValue(payload);
    }
    return responsePromise;
  }

  async readDTCs() {
    const { parseDtcResponse } = await import("./pids.js");
    const raw = await this._sendCommand("03");
    return parseDtcResponse(raw);
  }

  startLiveData(onUpdate, pids) {
    this.stopLiveData();
    import("./pids.js").then(({ LIVE_PIDS, parseHexResponse }) => {
      const list = pids || LIVE_PIDS;
      this.liveTimer = setInterval(async () => {
        const values = {};
        for (const pidDef of list) {
          try {
            const raw = await this._sendCommand(pidDef.command, 2000);
            const bytes = parseHexResponse(raw);
            if (bytes && bytes.length >= pidDef.bytes) {
              values[pidDef.key] = pidDef.decode(...bytes);
            }
          } catch {
            // einzelner PID nicht verfügbar – überspringen
          }
        }
        onUpdate(values);
      }, 1200);
    });
  }

  stopLiveData() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
  }
}
