// ===== Shortcuts & Base Constants =====
const $ = (id) => document.getElementById(id);
const BASE = { CO2_0: 280, CH4_0: 722, N2O_0: 270 }; // Pre-industrial baselines

// Read slider values and update display numbers
function readInputs() {
  const co2 = +$("co2").value,
    ch4 = +$("ch4").value,
    n2o = +$("n2o").value;
  const ren = +$("ren").value,
    waste = +$("waste").value,
    def = +$("deforest").value;

  // Update visible values near sliders
  $("co2Val").textContent = co2;
  $("ch4Val").textContent = ch4;
  $("n2oVal").textContent = n2o;
  $("renVal").textContent = ren;
  $("wasteVal").textContent = waste;
  $("defVal").textContent = def;

  return { co2, ch4, n2o, ren, waste, def };
}

// ===== Radiative Forcing Calculations (simplified IPCC-style) =====
function RF_CO2(C, C0) { return 5.35 * Math.log(C / C0); }
function f_overlap(M, N) { /* overlap correction for CH₄–N₂O bands */ 
  const term = 1 + 2.01e-5 * Math.pow(M * N, 0.75) + 5.31e-15 * M * Math.pow(M * N, 1.52);
  return 0.47 * Math.log(term);
}
function RF_CH4(M, M0, N, N0) { /* CH₄ forcing incl. overlap */ 
  return 0.036 * (Math.sqrt(M) - Math.sqrt(M0)) - (f_overlap(M, N0) - f_overlap(M0, N0));
}
function RF_N2O(N, N0, M, M0) { /* N₂O forcing incl. overlap */ 
  return 0.12 * (Math.sqrt(N) - Math.sqrt(N0)) - (f_overlap(M0, N) - f_overlap(M0, N0));
}

// Policy scaling factors for renewables & waste
function policyScale(ren, waste) {
  const renFactor = 1 - 0.6 * (ren / 100);
  const wasteFactor = 1 - 0.25 * (waste / 100);
  return { renFactor, wasteFactor };
}

// Simple extra forcing from deforestation
function deforestationExtra(def) { return 0.12 * def; }

// ===== Main computation combining all inputs =====
function compute() {
  const { co2, ch4, n2o, ren, waste, def } = readInputs();
  const rf_co2 = RF_CO2(co2, BASE.CO2_0);
  const rf_ch4 = RF_CH4(ch4, BASE.CH4_0, n2o, BASE.N2O_0);
  const rf_n2o = RF_N2O(n2o, BASE.N2O_0, ch4, BASE.CH4_0);

  // Apply policy multipliers
  const { renFactor, wasteFactor } = policyScale(ren, waste);
  const rf_co2_eff = rf_co2 * renFactor * 0.95;
  const rf_ch4_eff = rf_ch4 * wasteFactor;
  const rf_n2o_eff = rf_n2o * (0.9 * renFactor + 0.1);
  const rf_def = deforestationExtra(def);

  // Total forcing and derived metrics
  const rf_total = Math.max(0, rf_co2_eff + rf_ch4_eff + rf_n2o_eff + rf_def);
  const lambda = 0.8; // Climate sensitivity parameter
  const dT = rf_total * lambda;
  const slr = dT * 0.3; // Approximate sea-level rise per °C
  return {
    rf_total,
    dT,
    slr,
    parts: { CO2: rf_co2_eff, CH4: rf_ch4_eff, N2O: rf_n2o_eff, Land: rf_def },
    inputs: { co2, ch4, n2o, ren, waste, def },
  };
}

// ===== Visualization and Insights =====
// Update bar chart for forcing contributions
let chart;
function updateChart(parts) {
  const ctx = $("contribChart");

  // Optional: make the canvas itself translucent
  ctx.style.background = "rgba(255, 255, 255, 0.1)";
  ctx.style.border = "2px solid rgba(191, 68, 68, 0.7)";
  ctx.style.borderRadius = "16px";
  ctx.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar", // can change to "line" if needed
    data: {
      labels: Object.keys(parts),
      datasets: [
        {
          label: "Forcing contribution (W/m²)",
          data: Object.values(parts),
          backgroundColor: "rgba(191, 68, 68, 0.3)", // translucent bar color
          borderColor: "rgba(191, 68, 68, 0.7)",     // thicker, darker bar border
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { 
          beginAtZero: true,
          grid: { color: "rgba(255,255,255,0.1)" } // soft translucent gridlines
        },
        x: { 
          grid: { color: "rgba(255,255,255,0.1)" } 
        },
      },
    },
  });
}


// Air quality estimation (qualitative gauge)
function airQualityInfo(ren, waste) {
  const score = 0.6 * (ren / 100) + 0.4 * (waste / 60);
  if (score > 0.75) return { label: "High", level: 2 }; // Use a numeric level
  if (score > 0.4) return { label: "Medium", level: 1 };
  return { label: "Low", level: 0 };
}

// Generate descriptive “AI insights” based on outputs
function generateInsights(out) {
  const { rf_total, dT, slr, parts, inputs } = out;
  const lines = [];
  const target = 1.5;
  lines.push(`Projected equilibrium warming: ~${dT.toFixed(2)}°C (forcing ${rf_total.toFixed(2)} W/m²).`);

  // Suggest actions if target exceeded
  if (dT > target) {
    const deltaNeeded = Math.max(0, (dT - target) / 0.8);
    lines.push(`To reach ~${target}°C, reduce ≈${deltaNeeded.toFixed(2)} W/m² via renewables or waste cuts.`);
  } else {
    lines.push(`Within ~${target}°C — but adaptation still needed.`);
  }

  // Identify top forcing source
  const main = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
  lines.push(`Top contributor: ${main[0]} (${main[1].toFixed(2)} W/m²).`);

  // Additional conditional insights
  if (inputs.ren >= 60) lines.push("High renewables share improves air quality & lowers CO₂.");
  if (inputs.waste >= 30) lines.push("Waste cuts reduce methane emissions.");
  if (inputs.def >= 1) lines.push("Deforestation adds warming — forest protection helps.");
  lines.push(`Estimated sea-level rise: ~${slr.toFixed(2)} m by 2100.`);
  return lines;
}

// ===== Render Everything =====
function render() {
  const out = compute();
  $("rf").textContent = out.rf_total.toFixed(2);
  $("dT").textContent = out.dT.toFixed(2);
  $("slr").textContent = out.slr.toFixed(2);
  updateChart(out.parts);

  // Get air quality info and update the new gauge
  const { ren, waste } = out.inputs;
  const aqInfo = airQualityInfo(ren, waste);
  updateAirQualityGauge(aqInfo.level); // <-- THIS IS THE KEY FIX

  // Display generated text insights
  const lines = generateInsights(out);
  $("insights").innerHTML = lines.map((l) => `<div class='insight'>${l}</div>`).join("");
  // Update sea-level tile “water fill”
  const MAX_SLR = 1.77; // maximum possible for your simulation
  const slrPercent = Math.min((out.slr / MAX_SLR) * 100, 100);

  // Add a subtle wave-like effect using repeating-linear-gradient
  $("slrTile").style.background = `
    linear-gradient(to top, rgba(255,77,77,0.3) ${slrPercent}%, var(--card) ${slrPercent}%),
    repeating-linear-gradient(
      45deg,
      rgba(255,77,77,0.2),
      rgba(255,77,77,0.2) 5px,
      rgba(255,77,77,0.3) 10px
    )
  `;
  $("slrTile").style.borderRadius = "12px"; // optional, for smooth edges

}
document.getElementById('copyInsights').addEventListener('click', () => {
  const insightsElements = document.querySelectorAll('#insights .insight');
  if (insightsElements.length === 0) return; // Nothing to copy

  const textToCopy = Array.from(insightsElements)
    .map(elem => elem.textContent.trim())
    .join('\n');

  navigator.clipboard.writeText(textToCopy).then(() => {
    const btn = document.getElementById('copyInsights');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  }).catch(() => {
    alert('Failed to copy insights. Please copy manually.');
  });
});

// ===== Event Listeners =====

// Live update on slider change
["co2", "ch4", "n2o", "ren", "waste", "deforest"].forEach((id) => {
  $(id).addEventListener("input", () => { readInputs(); render(); });
});

// Manual recalc / reset buttons
$("recalc").addEventListener("click", () => render());
$("reset").addEventListener("click", () => {
  $("co2").value = 420; $("ch4").value = 1900; $("n2o").value = 335;
  $("ren").value = 20; $("waste").value = 0; $("deforest").value = 0.3;
  readInputs(); render();
});

// ===== Initial startup =====
readInputs();
render();
// ==== AIR QUALITY SEMICIRCLE UPDATE ====
function updateAirQualityGauge(level) {
  const aqProgress = document.getElementById("aqProgress");
  const aqText = document.getElementById("aqText");

  // Level can be: 0 (Low), 1 (Medium), 2 (High)
  const dashArray = 126; // total length of arc
  const fill = (level / 2) * dashArray;
  aqProgress.style.strokeDashoffset = dashArray - fill;

  if (level === 0) {
    aqProgress.style.stroke = "#ff5a5a"; // red
    aqText.textContent = "Low";
  } else if (level === 1) {
    aqProgress.style.stroke = "#ffc04d"; // yellow
    aqText.textContent = "Medium";
  } else {
    aqProgress.style.stroke = "#4dd47a"; // green
    aqText.textContent = "High";
  }
}
/*const header = document.getElementById('stickyHeader');
window.addEventListener('scroll', () => {
  if (window.scrollY > 150) {
    header.classList.add('top');
  } else {
    header.classList.remove('top');
  }
});
document.getElementById('stickyHeader').classList.add('top');
window.addEventListener('scroll', () => {
  console.log(window.scrollY);
  if (window.scrollY > 50) {
    header.classList.add('top');
  } else {
    header.classList.remove('top');
  }
});
*/
// ==== Reveal Cards on Arrow Click ====
// Maximum sea level possible in your parameter range


