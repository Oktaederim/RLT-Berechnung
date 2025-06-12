// --- GLOBAL STATE ---
let referenceCost = null;
let currentTotalCost = 0;

// --- DOM ELEMENT CACHING ---
const dom = {
    // Inputs
    tempAussen: document.getElementById('tempAussen'),
    rhAussen: document.getElementById('rhAussen'),
    tempZuluft: document.getElementById('tempZuluft'),
    rhZuluft: document.getElementById('rhZuluft'),
    xZuluft: document.getElementById('xZuluft'),
    volumenstrom: document.getElementById('volumenstrom'),
    kuehlerAktiv: document.getElementById('kuehlerAktiv'),
    tempVorerhitzer: document.getElementById('tempVorerhitzer'),
    druck: document.getElementById('druck'),
    feuchteSollTyp: document.getElementById('feuchteSollTyp'),
    sollFeuchteWrapper: document.getElementById('sollFeuchteWrapper'),

    // Cost & Slider Inputs
    preisWaerme: document.getElementById('preisWaerme'),
    preisStrom: document.getElementById('preisStrom'),
    eer: document.getElementById('eer'),
    volumenstromSlider: document.getElementById('volumenstromSlider'),
    tempZuluftSlider: document.getElementById('tempZuluftSlider'),
    rhZuluftSlider: document.getElementById('rhZuluftSlider'),

    // Labels for Sliders
    volumenstromLabel: document.getElementById('volumenstromLabel'),
    tempZuluftLabel: document.getElementById('tempZuluftLabel'),
    rhZuluftLabel: document.getElementById('rhZuluftLabel'),
    rhZuluftSliderGroup: document.getElementById('rhZuluftSliderGroup'),

    // Outputs
    resultsCard: document.getElementById('results-card'),
    kostenGesamt: document.getElementById('kostenGesamt'),
    kostenAenderung: document.getElementById('kostenAenderung'),
    setReferenceBtn: document.getElementById('setReferenceBtn'),
};

// --- CONSTANTS ---
const R_d = 287.058; // J/(kg·K)
const R_v = 461.52;  // J/(kg·K)
const CP_WASSER = 4.186; // kJ/(kg·K)
const TOLERANCE = 0.01;

// --- PSYCHROMETRIC HELPER FUNCTIONS ---
function getPs(T) {
    if (T >= 0) return 611.2 * Math.exp((17.62 * T) / (243.12 + T));
    else return 611.2 * Math.exp((22.46 * T) / (272.62 + T));
}
function getX(T, rH, p) {
    const p_s = getPs(T);
    const p_v = (rH / 100) * p_s;
    if (p_v >= p) return Infinity;
    return 622 * (p_v / (p - p_v));
}
function getRh(T, x, p) {
    const p_s = getPs(T);
    const p_v = (p * x) / (622 + x);
    return Math.min(100, (p_v / p_s) * 100);
}
function getTd(x, p) {
    const p_v = (p * x) / (622 + x);
    if (p_v < 611.2) return -60;
    const log_pv_ratio = Math.log(p_v / 611.2);
    return (243.12 * log_pv_ratio) / (17.62 - log_pv_ratio);
}
function getH(T, x_g_kg) {
    const x_kg_kg = x_g_kg / 1000.0;
    return 1.006 * T + x_kg_kg * (2501 + 1.86 * T);
}

// --- MAIN CALCULATION FUNCTION ---
function calculateAll() {
    // 1. Read all input values
    const inputs = {
        tempAussen: parseFloat(dom.tempAussen.value),
        rhAussen: parseFloat(dom.rhAussen.value),
        tempZuluft: parseFloat(dom.tempZuluft.value),
        rhZuluft: parseFloat(dom.rhZuluft.value),
        xZuluft: parseFloat(dom.xZuluft.value),
        volumenstrom: parseFloat(dom.volumenstrom.value),
        kuehlerAktiv: dom.kuehlerAktiv.checked,
        tempVorerhitzerSoll: parseFloat(dom.tempVorerhitzer.value),
        druck: parseFloat(dom.druck.value) * 100, // Pa
        feuchteSollTyp: dom.feuchteSollTyp.value,
        preisWaerme: parseFloat(dom.preisWaerme.value),
        preisStrom: parseFloat(dom.preisStrom.value),
        eer: parseFloat(dom.eer.value)
    };

    if (Object.values(inputs).some(v => isNaN(v) && typeof v === 'number')) return;
    
    // 2. Initial State Calculations
    const aussen = {
        t: inputs.tempAussen,
        rh: inputs.rhAussen,
        x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck),
    };
    aussen.h = getH(aussen.t, aussen.x);

    const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;

    // 3. Determine Target State (Zuluft)
    const zuluftSoll = { t: inputs.tempZuluft };
    if (inputs.kuehlerAktiv) {
        if (inputs.feuchteSollTyp === 'rh') {
            zuluftSoll.rh = inputs.rhZuluft;
            zuluftSoll.x = getX(zuluftSoll.t, zuluftSoll.rh, inputs.druck);
        } else {
            zuluftSoll.x = inputs.xZuluft;
            zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
        }
    } else {
        zuluftSoll.x = aussen.x;
        zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
    }
    zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

    // 4. Process Simulation
    let currentState = { ...aussen };
    const processSteps = [];

    // Vorerhitzer, Kühler, Nacherhitzer...
    if (currentState.t < inputs.tempVorerhitzerSoll) {
        const leistung = massenstrom_kg_s * (getH(inputs.tempVorerhitzerSoll, currentState.x) - currentState.h);
        currentState.t = inputs.tempVorerhitzerSoll;
        currentState.h = getH(currentState.t, currentState.x);
        currentState.rh = getRh(currentState.t, currentState.x, inputs.druck);
        processSteps.push({ name: '🔥 Vorerhitzer (Frostschutz)', leistung: leistung, stateAfter: { ...currentState } });
    }
    if (inputs.kuehlerAktiv && currentState.x > zuluftSoll.x + TOLERANCE) {
        const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
        const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
        const leistung = massenstrom_kg_s * (currentState.h - hNachKuehler);
        const kondensat = massenstrom_kg_s * (currentState.x - zuluftSoll.x) / 1000 * 3600;
        currentState.t = tempNachKuehler;
        currentState.h = hNachKuehler;
        currentState.x = zuluftSoll.x;
        currentState.rh = getRh(currentState.t, currentState.x, inputs.druck);
        processSteps.push({ name: '💧 Kühler & Entfeuchter', leistung: leistung, kondensat: kondensat, stateAfter: { ...currentState } });
    }
    if (currentState.t < zuluftSoll.t - TOLERANCE) {
        const leistung = massenstrom_kg_s * (zuluftSoll.h - currentState.h);
        currentState.t = zuluftSoll.t;
        currentState.h = zuluftSoll.h;
        currentState.rh = zuluftSoll.rh;
        currentState.x = zuluftSoll.x;
        processSteps.push({ name: '🔥 Nacherhitzer', leistung: leistung, stateAfter: { ...currentState } });
    }

    // 5. Render Results
    renderResults(aussen, processSteps);
    
    // 6. Calculate and Render Costs
    calculateAndRenderCosts(processSteps, inputs);
}

// --- RENDER FUNCTIONS ---
function renderResults(aussen, steps) {
    let html = `<h2>Anlagenprozess & Zustände</h2>`;
    if (steps.length === 0) {
        html += `<div class="process-overview process-success">Idealzustand: Keine Luftbehandlung erforderlich.</div>`;
        dom.resultsCard.innerHTML = html;
        return;
    }
    const overview = steps.map(s => s.name.split(' ')[1]).join(' → ');
    html += `<div class="process-overview process-info">Prozesskette: ${overview}</div>`;
    const createResultItem = (label, value, unit) => `<div class="result-item"><span class="label">${label}</span><span class="value">${value} ${unit}</span></div>`;
    const createStateBlock = (state) => createResultItem('Temperatur', state.t.toFixed(1), '°C') + createResultItem('Relative Feuchte', state.rh.toFixed(1), '%') + createResultItem('Absolute Feuchte', state.x.toFixed(2), 'g/kg') + createResultItem('Enthalpie', state.h.toFixed(2), 'kJ/kg');
    html += `<div class="process-step"><h4>🌍 Außenluft (Start)</h4><div class="result-grid">${createStateBlock(aussen)}</div></div>`;
    steps.forEach(step => {
        html += `<div class="process-step"><h4>${step.name}</h4><div class="result-grid">`;
        if(step.leistung > 0) html += createResultItem('Leistung', step.leistung.toFixed(2), 'kW');
        if(step.kondensat > 0) html += createResultItem('Kondensat', step.kondensat.toFixed(2), 'kg/h');
        html += `</div><hr><h5>Zustand danach:</h5><div class="result-grid">${createStateBlock(step.stateAfter)}</div></div>`;
    });
    dom.resultsCard.innerHTML = html;
}

function calculateAndRenderCosts(steps, inputs) {
    let heizLeistung = 0, kaelteLeistung = 0;
    steps.forEach(step => {
        if (step.name.includes('Vorerhitzer') || step.name.includes('Nacherhitzer')) heizLeistung += step.leistung;
        else if (step.name.includes('Kühler')) kaelteLeistung += step.leistung;
    });

    const kostenHeizung = heizLeistung * inputs.preisWaerme;
    const kostenKuehlung = (kaelteLeistung / inputs.eer) * inputs.preisStrom;
    currentTotalCost = kostenHeizung + kostenKuehlung;
    dom.kostenGesamt.textContent = `${currentTotalCost.toFixed(2)} €/h`;

    // Compare with reference
    if (referenceCost !== null) {
        const changeAbs = currentTotalCost - referenceCost;
        const changePerc = referenceCost > 0 ? (changeAbs / referenceCost) * 100 : 0;
        
        const sign = changeAbs > 0 ? '+' : '';
        dom.kostenAenderung.textContent = `${sign}${changeAbs.toFixed(2)} €/h (${sign}${changePerc.toFixed(1)} %)`;
        dom.kostenAenderung.className = 'cost-value'; // Reset class
        if (changeAbs < -TOLERANCE) dom.kostenAenderung.classList.add('saving');
        else if (changeAbs > TOLERANCE) dom.kostenAenderung.classList.add('expense');
    } else {
        dom.kostenAenderung.textContent = '--';
        dom.kostenAenderung.className = 'cost-value';
    }
}

// --- EVENT HANDLERS & UI LOGIC ---
function handleSetReference() {
    referenceCost = currentTotalCost;
    dom.setReferenceBtn.textContent = 'Referenz Gesetzt!';
    dom.setReferenceBtn.classList.add('activated');
    setTimeout(() => {
        dom.setReferenceBtn.textContent = 'Neue Referenz festlegen';
        dom.setReferenceBtn.classList.remove('activated');
    }, 2000);
    calculateAll(); // Recalculate to show 0% change
}

function handleFeuchteSollChange() {
    const isRh = dom.feuchteSollTyp.value === 'rh';
    dom.rhZuluft.classList.toggle('hidden', !isRh);
    dom.xZuluft.classList.toggle('hidden', isRh);
    dom.rhZuluftSliderGroup.classList.toggle('hidden', !isRh);
    calculateAll();
}

function handleKuehlerToggle() {
    const isActive = dom.kuehlerAktiv.checked;
    dom.sollFeuchteWrapper.style.opacity = isActive ? '1' : '0.5';
    dom.feuchteSollTyp.disabled = !isActive;
    dom.rhZuluft.disabled = !isActive;
    dom.xZuluft.disabled = !isActive;
    dom.rhZuluftSlider.disabled = !isActive;
    dom.rhZuluftSliderGroup.style.opacity = isActive ? '1' : '0.5';
    calculateAll();
}

function syncInputsAndSliders() {
    const sync = (slider, input, label, isFloat = false) => {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            label.textContent = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
            calculateAll();
        });
        input.addEventListener('input', () => {
            slider.value = input.value;
            label.textContent = isFloat ? parseFloat(input.value).toFixed(1) : input.value;
        });
    };
    sync(dom.volumenstromSlider, dom.volumenstrom, dom.volumenstromLabel);
    sync(dom.tempZuluftSlider, dom.tempZuluft, dom.tempZuluftLabel, true);
    sync(dom.rhZuluftSlider, dom.rhZuluft, dom.rhZuluftLabel, true);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    Object.values(dom).forEach(element => {
        if (element && (element.tagName === 'INPUT' && element.type !== 'range' || element.tagName === 'SELECT')) {
            element.addEventListener('input', calculateAll);
        }
    });
    
    dom.feuchteSollTyp.addEventListener('change', handleFeuchteSollChange);
    dom.kuehlerAktiv.addEventListener('change', handleKuehlerToggle);
    dom.setReferenceBtn.addEventListener('click', handleSetReference);
    syncInputsAndSliders();

    handleKuehlerToggle();
    calculateAll();
});
