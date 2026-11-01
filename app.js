/* BLE Traffic Monitor - receive-only browser client.
   PICS-specific decoding is intentionally not guessed. Add a verified
   protocol adapter only when the official payload specification is available. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    device: null,
    abortController: null,
    packets: [],
    devices: new Set(),
    selectedId: null,
    scanning: false
  };

  const startBtn = $("startBtn");
  const stopBtn = $("stopBtn");
  const rows = $("packetRows");

  function setNotice(message, type = "info") {
    $("notice").className = `notice ${type}`;
    $("noticeText").textContent = message;
    $("notice").querySelector(".notice-icon").textContent =
      type === "error" ? "!" : type === "success" ? "✓" : "i";
  }

  function setScanning(active, detail = "") {
    state.scanning = active;
    startBtn.disabled = active;
    stopBtn.disabled = !active;
    $("scanStatus").textContent = active ? "SCANNING" : "IDLE";
    $("scanStatus").style.color = active ? "var(--green)" : "var(--text)";
    $("scanDetail").textContent = detail || (active ? "広告イベントを監視中" : "スキャン待機中");
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  function dataViewToBytes(view) {
    return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }

  function mapToData(map, kind) {
    if (!map || typeof map.entries !== "function") return [];
    return Array.from(map.entries()).map(([key, view]) => ({
      key: kind === "manufacturer" ? `0x${Number(key).toString(16).padStart(4, "0").toUpperCase()}` : key,
      bytes: dataViewToBytes(view),
      hex: bytesToHex(dataViewToBytes(view)),
      kind
    }));
  }

  function flattenAdvertisement(event) {
    const manufacturer = mapToData(event.manufacturerData, "manufacturer");
    const services = mapToData(event.serviceData, "service");
    return [...manufacturer, ...services];
  }

  function safeDeviceName(device) {
    return device?.name?.trim() || "Unknown device";
  }

  function packetToRecord(event) {
    const chunks = flattenAdvertisement(event);
    const deviceId = event.device?.id || "unknown";
    const allBytes = chunks.flatMap(chunk => chunk.bytes);
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date(),
      deviceId,
      name: safeDeviceName(event.device),
      rssi: Number.isFinite(event.rssi) ? event.rssi : null,
      txPower: Number.isFinite(event.txPower) ? event.txPower : null,
      uuids: Array.isArray(event.uuids) ? event.uuids : [],
      manufacturer: chunks.filter(x => x.kind === "manufacturer"),
      services: chunks.filter(x => x.kind === "service"),
      chunks,
      bytes: allBytes,
      hex: bytesToHex(allBytes)
    };
  }

  function rssiClass(value) {
    if (value === null) return "";
    return value >= -65 ? "rssi-good" : value >= -80 ? "rssi-mid" : "rssi-low";
  }

  function renderStats() {
    $("packetCount").textContent = state.packets.length.toLocaleString();
    $("deviceCount").textContent = state.devices.size.toLocaleString();
    const latest = state.packets[0];
    $("lastRssi").innerHTML = latest?.rssi === null || !latest
      ? '— <small>dBm</small>'
      : `${latest.rssi} <small>dBm</small>`;
    $("rssiFoot").textContent = latest ? `最終受信: ${formatTime(latest.timestamp)}` : "受信強度は距離の正確な指標ではありません";
    $("feedSummary").textContent = `${state.packets.length} events`;
    $("exportBtn").disabled = state.packets.length === 0;
  }

  function formatTime(date) {
    return date.toLocaleTimeString("ja-JP", { hour12: false });
  }

  function renderRows() {
    if (!state.packets.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state"><span>⌁</span><strong>まだパケットはありません</strong><small>「スキャン開始」からBLEデバイスを選択してください。</small></div></td></tr>';
      return;
    }
    rows.innerHTML = state.packets.slice(0, 150).map(packet => {
      const rssi = packet.rssi === null ? "—" : `${packet.rssi} dBm`;
      const tx = packet.txPower === null ? "—" : `${packet.txPower} dBm`;
      const preview = packet.hex || "広告データなし / メタデータのみ";
      return `<tr class="data-row ${packet.id === state.selectedId ? "selected" : ""}" data-id="${escapeHtml(packet.id)}">
        <td class="mono">${formatTime(packet.timestamp)}</td>
        <td><div class="device-cell"><span class="mini-device">⌘</span><div><div class="device-name">${escapeHtml(packet.name)}</div><div class="sub-id">${escapeHtml(shortId(packet.deviceId))}</div></div></div></td>
        <td class="mono ${rssiClass(packet.rssi)}">${rssi}</td>
        <td class="mono">${tx}</td>
        <td><div class="hex-preview">${escapeHtml(preview)}</div></td>
      </tr>`;
    }).join("");
  }

  function shortId(id) {
    if (!id || id.length < 16) return id || "—";
    return `${id.slice(0, 8)}…${id.slice(-5)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function renderDetail(packet) {
    $("detailEmpty").classList.add("hidden");
    $("detailContent").classList.remove("hidden");
    $("detailName").textContent = packet.name;
    $("detailId").textContent = packet.deviceId;
    $("detailRssi").textContent = packet.rssi === null ? "—" : `${packet.rssi} dBm`;
    $("detailTx").textContent = packet.txPower === null ? "—" : `${packet.txPower} dBm`;
    $("detailTime").textContent = packet.timestamp.toLocaleString("ja-JP");
    $("detailHex").textContent = packet.hex || "(Manufacturer / Service Dataなし)";
    $("dataLength").textContent = `${packet.bytes.length} bytes`;
    const fields = [
      ["Device name", packet.name],
      ["Device ID", packet.deviceId],
      ["Advertised UUIDs", packet.uuids.join(", ") || "なし"],
      ["Manufacturer records", String(packet.manufacturer.length)],
      ["Service data records", String(packet.services.length)]
    ];
    packet.manufacturer.forEach((item, i) => fields.push([`Manufacturer ${i + 1} (${item.key})`, item.hex || "(empty)"]));
    packet.services.forEach((item, i) => fields.push([`Service ${i + 1} (${item.key})`, item.hex || "(empty)"]));
    $("detailFields").innerHTML = fields.map(([label, value]) =>
      `<div class="field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    ).join("");
    const json = {
      timestamp: packet.timestamp.toISOString(),
      device: { name: packet.name, id: packet.deviceId },
      rssi: packet.rssi,
      txPower: packet.txPower,
      advertisedUuids: packet.uuids,
      manufacturerData: packet.manufacturer.map(x => ({ companyId: x.key, hex: x.hex, bytes: x.bytes })),
      serviceData: packet.services.map(x => ({ uuid: x.key, hex: x.hex, bytes: x.bytes }))
    };
    $("detailJson").textContent = JSON.stringify(json, null, 2);
  }

  function drawChart() {
    const canvas = $("rssiChart");
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const values = state.packets.slice(0, 30).filter(p => p.rssi !== null).map(p => p.rssi).reverse();
    $("chartEmpty").style.display = values.length ? "none" : "grid";
    if (!values.length) return;
    const pad = { l: 25, r: 8, t: 12, b: 20 };
    const min = Math.min(-100, ...values) - 3;
    const max = Math.max(-35, ...values) + 3;
    const x = i => pad.l + (values.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (values.length - 1));
    const y = v => pad.t + (max - v) * (h - pad.t - pad.b) / (max - min);
    ctx.strokeStyle = "#25344a"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const yy = pad.t + i * (h - pad.t - pad.b) / 3;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
    }
    ctx.fillStyle = "#6f829d"; ctx.font = '9px "DM Mono"';
    ctx.fillText(`${Math.round(max)} dBm`, 2, 9);
    ctx.fillText(`${Math.round(min)} dBm`, 2, h - 4);
    const gradient = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    gradient.addColorStop(0, "rgba(84,214,208,.24)");
    gradient.addColorStop(1, "rgba(84,214,208,0)");
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.lineTo(x(values.length - 1), h - pad.b); ctx.lineTo(x(0), h - pad.b); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = "#54d6d0"; ctx.lineWidth = 2; ctx.stroke();
    values.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(x(i), y(v), 2.7, 0, Math.PI * 2);
      ctx.fillStyle = "#9af1e8"; ctx.fill();
    });
  }

  function onAdvertisement(event) {
    const packet = packetToRecord(event);
    state.packets.unshift(packet);
    state.devices.add(packet.deviceId);
    if (state.packets.length > 1000) state.packets.length = 1000;
    if (!state.selectedId) {
      state.selectedId = packet.id;
      renderDetail(packet);
    }
    renderStats();
    renderRows();
    drawChart();
  }

  async function startScan() {
    if (!navigator.bluetooth) {
      setNotice("このブラウザではWeb Bluetooth APIを利用できません。対応するデスクトップ版Chrome/EdgeとBluetoothアダプターを確認してください。", "error");
      return;
    }
    if (!window.isSecureContext) {
      setNotice("安全なコンテキストが必要です。GitHub PagesのHTTPS URLまたはlocalhostから開いてください。", "error");
      return;
    }
    try {
      setNotice("デバイス選択ダイアログを開いています。受信を許可するBLEデバイスを選択してください。");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: []
      });
      state.device = device;
      device.addEventListener("advertisementreceived", onAdvertisement);
      state.abortController = new AbortController();
      await device.watchAdvertisements({ signal: state.abortController.signal });
      setScanning(true, `監視対象: ${safeDeviceName(device)}`);
      setNotice(`「${safeDeviceName(device)}」の広告イベントを待機しています。ブラウザ・OSによって受信可能な広告が異なります。`, "success");
      device.addEventListener("advertisementreceived", () => {
        if (state.scanning) setNotice(`受信中: ${safeDeviceName(device)} — 広告イベントを取得しました。`, "success");
      });
      device.addEventListener("gattserverdisconnected", () => {
        if (state.scanning) stopScan("デバイスとの監視が終了しました。");
      });
    } catch (error) {
      const message = error?.name === "NotFoundError" ? "デバイス選択がキャンセルされたか、利用可能なデバイスがありません。"
        : error?.name === "NotAllowedError" ? "Bluetooth利用が許可されませんでした。ブラウザの権限を確認してください。"
        : error?.name === "NotSupportedError" ? "この環境では広告監視APIがサポートされていません。"
        : error?.message || "BLEスキャンを開始できませんでした。";
      setScanning(false);
      setNotice(message, "error");
    }
  }

  function stopScan(message = "スキャンを停止しました。") {
    try { state.abortController?.abort(); } catch (_) {}
    if (state.device) state.device.removeEventListener("advertisementreceived", onAdvertisement);
    state.abortController = null;
    state.device = null;
    setScanning(false);
    setNotice(message, "info");
  }

  function exportCsv() {
    if (!state.packets.length) return;
    const header = ["timestamp", "device_name", "device_id", "rssi_dbm", "tx_power_dbm", "advertised_uuids", "manufacturer_data", "service_data"];
    const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    state.packets.slice().reverse().forEach(p => {
      lines.push([
        p.timestamp.toISOString(), p.name, p.deviceId, p.rssi, p.txPower,
        p.uuids.join(";"),
        p.manufacturer.map(x => `${x.key}:${x.hex}`).join(";"),
        p.services.map(x => `${x.key}:${x.hex}`).join(";")
      ].map(quote).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ble-traffic-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  startBtn.addEventListener("click", startScan);
  stopBtn.addEventListener("click", () => stopScan());
  $("exportBtn").addEventListener("click", exportCsv);
  $("clearBtn").addEventListener("click", () => {
    state.packets = []; state.devices.clear(); state.selectedId = null;
    $("detailContent").classList.add("hidden"); $("detailEmpty").classList.remove("hidden");
    renderStats(); renderRows(); drawChart();
  });
  rows.addEventListener("click", event => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const packet = state.packets.find(p => p.id === row.dataset.id);
    if (!packet) return;
    state.selectedId = packet.id;
    renderRows(); renderDetail(packet);
  });
  window.addEventListener("resize", drawChart);
  window.addEventListener("beforeunload", () => {
    try { state.abortController?.abort(); } catch (_) {}
  });

  if (!navigator.bluetooth) {
    setNotice("このブラウザはWeb Bluetooth APIに対応していない可能性があります。デスクトップ版Chrome/Edgeを推奨します。", "error");
  } else if (!window.isSecureContext) {
    setNotice("HTTPSまたはlocalhostが必要です。GitHub Pagesで公開するとHTTPSで利用できます。");
  }
  renderStats(); renderRows(); drawChart();
})();
