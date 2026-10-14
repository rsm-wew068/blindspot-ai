export function drawMap(canvas, frame, s, collision) {
  const ctx = canvas.getContext("2d");
  function rounded(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function text(s, x, y, color = "#8b997b", size = 9, align = "left") {
    ctx.font = `${size}px ui-monospace, monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
    ctx.textAlign = "left";
  }
  function draw() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(bounds.width * dpr) ||
      canvas.height !== Math.round(bounds.height * dpr)
    ) {
      canvas.width = Math.round(bounds.width * dpr);
      canvas.height = Math.round(bounds.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = bounds.width,
      h = bounds.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e9ede2";
    ctx.fillRect(0, 0, w, h);
    const sx = (w - 46) / 62,
      sy = 15,
      roadY = h * 0.58,
      X = (x) => 23 + x * sx,
      Y = (y) => roadY - y * sy;
    // Quiet survey grid and planting beds frame a legible, deliberately schematic road.
    ctx.strokeStyle = "#dde4d4";
    ctx.lineWidth = 0.5;
    for (let x = 15; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 10; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    rounded(22, 58, Math.max(40, w * 0.4), 42, 6, "#e2e8d7");
    rounded(w * 0.68, 58, w * 0.25, 42, 6, "#e2e8d7");
    ctx.fillStyle = "#d0d8c7";
    ctx.fillRect(0, Y(2.25), w, 7.5 * sy);
    ctx.fillStyle = "#879180";
    ctx.fillRect(0, Y(1.75), w, 6.6 * sy);
    ctx.strokeStyle = "#d0d7c6";
    ctx.lineWidth = 1;
    ctx.setLineDash([17, 17]);
    ctx.beginPath();
    ctx.moveTo(0, Y(-1.6));
    ctx.lineTo(w, Y(-1.6));
    ctx.stroke();
    ctx.setLineDash([]);
    // Pedestrian crossing markings.
    for (let yy = -4.4; yy < 1.8; yy += 0.9) {
      ctx.fillStyle = "#dbe1d1";
      ctx.fillRect(X(43), Y(yy), 4 * sx, 0.47 * sy);
    }
    text("APPROACH →", 24, Y(-4.7) + 23, "#98a38c", 8);
    text("45 m", X(45), Y(-4.7) + 23, "#98a38c", 8, "center");
    const vanStart = 45 - s.van_gap - 5,
      vanEnd = 45 - s.van_gap;
    // Project the obstacle's angular shadow from the vehicle-front sensor.
    const sensorX = frame.x + 2.1;
    const corners = [
      [vanStart, 2.2],
      [vanEnd, 2.2],
      [vanStart, 4.8],
      [vanEnd, 4.8],
    ];
    let rays = corners
      .map(([x, y]) => ({ x, y, angle: Math.atan2(y, x - sensorX) }))
      .sort((a, b) => a.angle - b.angle);
    const near = rays[0],
      far = rays[rays.length - 1],
      min = near.angle,
      max = far.angle;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 42, w, h - 76);
    ctx.clip();
    ctx.fillStyle = "#c4d49570";
    ctx.beginPath();
    ctx.moveTo(X(near.x), Y(near.y));
    ctx.lineTo(X(sensorX + 80 * Math.cos(min)), Y(80 * Math.sin(min)));
    ctx.lineTo(X(sensorX + 80 * Math.cos(max)), Y(80 * Math.sin(max)));
    ctx.lineTo(X(far.x), Y(far.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Van and ego vehicle use world dimensions; view scales differ by axis for clarity.
    rounded(X(vanStart), Y(4.8), 5 * sx, 2.6 * sy, 4, "#fbfcf7", "#c2cbb8");
    rounded(X(vanEnd) - 7, Y(4.8) + 5, 4, 2.6 * sy - 10, 2, "#a9b7a0");
    ctx.strokeStyle = "#d2daca";
    ctx.beginPath();
    ctx.moveTo(X(vanStart) + 9, Y(4.8) + 4);
    ctx.lineTo(X(vanStart) + 9, Y(2.2) - 4);
    ctx.stroke();
    text(
      "PARKED VAN",
      X((vanStart + vanEnd) / 2),
      Y(4.8) - 8,
      "#8a997c",
      8,
      "center",
    );
    if (frame.ped_y !== null) {
      const px = X(45),
        py = Y(frame.ped_y);
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = frame.visible ? "#dd845729" : "#bdc7b947";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = frame.visible ? "#cf744a" : "#a3ad97";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      text(
        frame.visible ? "VISIBLE" : "OCCLUDED",
        px + 12,
        py + 3,
        frame.visible ? "#b4704c" : "#8a997c",
        7,
      );
    }
    const carW = 4.2 * sx,
      carH = 1.8 * sy;
    ctx.shadowColor = "#263e3520";
    ctx.shadowBlur = 7;
    rounded(X(frame.x - 2.1), Y(0.9), carW, carH, 5, "#35533d");
    ctx.shadowBlur = 0;
    rounded(
      X(frame.x - 2.1) + carW * 0.61,
      Y(0.9) + 3,
      carW * 0.22,
      carH - 6,
      2,
      "#a9be99",
    );
    rounded(
      X(frame.x - 2.1) + carW * 0.1,
      Y(0.9) + 4,
      carW * 0.15,
      carH - 8,
      2,
      "#78966b",
    );
    if (frame.a < 0) {
      ctx.fillStyle = "#eb9970";
      ctx.fillRect(X(frame.x - 2.1), Y(0.9) + 3, 2, 5);
      ctx.fillRect(X(frame.x - 2.1), Y(-0.9) - 8, 2, 5);
    }
    text(
      (frame.v * 3.6).toFixed(1) + " km/h",
      Math.max(33, X(frame.x)),
      Y(-0.9) + 17,
      "#e1e9d6",
      8,
      "center",
    );
    if (collision) {
      ctx.beginPath();
      ctx.arc(X(frame.x + 2.1), Y(0), 18, 0, Math.PI * 2);
      ctx.strokeStyle = "#d87951";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text("N ↑", w - 23, h - 17, "#8b997b", 8, "right");
  }

  draw();
}
