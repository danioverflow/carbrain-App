export const LIVE_PIDS = [
  { pid: "0C", command: "010C", key: "rpm", label: { de: "Motordrehzahl", en: "Engine speed" }, unit: "U/min", unitEn: "rpm", bytes: 2, decode: (a, b) => Math.round(((a * 256) + b) / 4) },
  { pid: "0D", command: "010D", key: "speed", label: { de: "Geschwindigkeit", en: "Speed" }, unit: "km/h", unitEn: "km/h", bytes: 1, decode: (a) => a },
  { pid: "05", command: "0105", key: "coolantTemp", label: { de: "Kühlmitteltemperatur", en: "Coolant temperature" }, unit: "°C", unitEn: "°C", bytes: 1, decode: (a) => a - 40 },
  { pid: "0F", command: "010F", key: "intakeTemp", label: { de: "Ansauglufttemperatur", en: "Intake air temperature" }, unit: "°C", unitEn: "°C", bytes: 1, decode: (a) => a - 40 },
  { pid: "11", command: "0111", key: "throttle", label: { de: "Drosselklappenstellung", en: "Throttle position" }, unit: "%", unitEn: "%", bytes: 1, decode: (a) => Math.round((a * 100) / 255) },
  { pid: "2F", command: "012F", key: "fuelLevel", label: { de: "Tankfüllstand", en: "Fuel level" }, unit: "%", unitEn: "%", bytes: 1, decode: (a) => Math.round((a * 100) / 255) },
  { pid: "42", command: "0142", key: "voltage", label: { de: "Bordspannung", en: "Control module voltage" }, unit: "V", unitEn: "V", bytes: 2, decode: (a, b) => Math.round((((a * 256) + b) / 1000) * 10) / 10 },
  { pid: "0B", command: "010B", key: "manifoldPressure", label: { de: "Saugrohrdruck", en: "Manifold pressure" }, unit: "kPa", unitEn: "kPa", bytes: 1, decode: (a) => a },
];

export function pidLabel(pidDef, lang = "de") {
  return pidDef.label[lang] || pidDef.label.de;
}

export function parseHexResponse(raw) {
  const clean = raw.replace(/[\r\n>]/g, " ").trim();
  if (!clean || /NO DATA|UNABLE|ERROR|STOPPED|\?/.test(clean)) return null;
  const bytes = clean
    .split(/\s+/)
    .filter((h) => /^[0-9A-Fa-f]{2}$/.test(h))
    .map((h) => parseInt(h, 16));
  if (bytes.length < 3) return null;
  return bytes.slice(2);
}

export function parseDtcResponse(raw) {
  const clean = raw.replace(/[\r\n>]/g, " ").trim();
  if (!clean || /NO DATA|UNABLE|ERROR|STOPPED/.test(clean)) return [];
  const bytes = clean
    .split(/\s+/)
    .filter((h) => /^[0-9A-Fa-f]{2}$/.test(h))
    .map((h) => parseInt(h, 16));
  const data = bytes[0] === 0x43 ? bytes.slice(1) : bytes;
  const codes = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const a = data[i];
    const b = data[i + 1];
    if (a === 0 && b === 0) continue;
    const firstNibble = (a & 0xc0) >> 6;
    const prefix = ["P", "C", "B", "U"][firstNibble];
    const secondDigit = (a & 0x30) >> 4;
    const rest = ((a & 0x0f) << 8) | b;
    const code = `${prefix}${secondDigit}${rest.toString(16).toUpperCase().padStart(3, "0")}`;
    codes.push(code);
  }
  return codes;
}
