document.addEventListener('DOMContentLoaded', () => {

    let referenceState = null;
    let currentTotalCost = 0;

    const dom = {
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
        resetBtn: document.getElementById('resetBtn'),
        preisWaerme: document.getElementById('preisWaerme'),
        preisStrom: document.getElementById('preisStrom'),
        eer: document.getElementById('eer'),
        volumenstromSlider: document.getElementById('volumenstromSlider'),
        tempZuluftSlider: document.getElementById('tempZuluftSlider'),
        rhZuluftSlider: document.getElementById('rhZuluftSlider'),
        volumenstromLabel: document.getElementById('volumenstromLabel'),
        tempZuluftLabel: document.getElementById('tempZuluftLabel'),
        rhZuluftLabel: document.getElementById('rhZuluftLabel'),
        rhZuluftSliderGroup: document.getElementById('rhZuluftSliderGroup'),
        resetSlidersBtn: document.getElementById('resetSlidersBtn'),
        resultsCard: document.getElementById('results-card'),
        powerDetailsContainer: document.getElementById('power-details'),
        costDetailsContainer: document.getElementById('cost-details'),
    };

    const TOLERANCE = 0.01;

    function getPs(T) {
        if (T >= 0) return 611.2 * Math.exp((17.62 * T) / (243.12 + T));
        else return 611.2 * Math.exp((22.46 * T) / (272.62 + T));
    }
    function getX(T, rH, p) {
        if (p <= 0) return Infinity;
        const p_s = getPs(T);
        const p_v = (rH / 100) * p_s;
        if (p_v >= p) return Infinity;
        return 622 * (p_v / (p - p_v));
    }
    function getRh(T, x, p) {
        if (p <= 0) return 0;
        const p_s = getPs(T);
        if (p_s <= 0) return 0;
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
        if (!isFinite(x_g_kg)) return Infinity;
        const x_kg_kg = x_g_kg / 1000.0;
        return 1.006 * T + x_kg_kg * (2501 + 1.86 * T);
    }

    function calculateAll() {
        for (const field of [dom.tempAussen, dom.rhAussen, dom.tempZuluft, dom.rhZuluft, dom.xZuluft, dom.volumenstrom, dom.tempVorerhitzer, dom.druck, dom.preisWaerme, dom.preisStrom, dom.eer]) {
            if (field && field.offsetParent !== null && field.value === '') {
                dom.resultsCard.innerHTML = `<div class="process-overview process-error">Fehler: Ein sichtbares Eingabefeld ist leer. Bitte alle Felder ausfüllen.</div>`;
                return;
            }
        }

        const inputs = {
            tempAussen: parseFloat(dom.tempAussen.value), rhAussen: parseFloat(dom.rhAussen.value),
            tempZuluft: parseFloat(dom.tempZuluft.value), rhZuluft: parseFloat(dom.rhZuluft.value),
            xZuluft: parseFloat(dom.xZuluft.value), volumenstrom: parseFloat(dom.volumenstrom.value),
            kuehlerAktiv: dom.kuehlerAktiv.checked, tempVorerhitzerSoll: parseFloat(dom.tempVorerhitzer.value),
            druck: parseFloat(dom.druck.value) * 100, feuchteSollTyp: dom.feuchteSollTyp.value,
            preisWaerme: parseFloat(dom.preisWaerme.value), preisStrom: parseFloat(dom.preisStrom.value),
            eer: parseFloat(dom.eer.value)
        };

        if (Object.values(inputs).some(v => isNaN(v) && typeof v === 'number')) {
            dom.resultsCard.innerHTML = `<div class="process-overview process-error">Fehler: Ungültige Zahl in einem Eingabefeld.</div>`;
            return;
        }

        const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
        aussen.h = getH(aussen.t, aussen.x);

        if (!isFinite(aussen.x)) {
            dom.resultsCard.innerHTML = `<div class="process-overview process-error">Fehler im Außenluft-Zustand. Prüfen Sie Temperatur, Feuchte und Luftdruck.</div>`;
            return;
        }

        const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;
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

        let currentState = { ...aussen };
        const processSteps = [];

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
            currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
            processSteps.push({ name: '💧 Kühler & Entfeuchter', leistung: leistung, kondensat: kondensat, stateAfter: { ...currentState } });
        }
        if (currentState.t < zuluftSoll.t - TOLERANCE) {
            const leistung = massenstrom_kg_s * (zuluftSoll.h - currentState.h);
            currentState = { ...zuluftSoll };
            processSteps.push({ name: '🔥 Nacherhitzer', leistung: leistung, stateAfter: { ...currentState } });
        }

        renderResults(aussen, processSteps);
        calculateAndRenderCosts(processSteps, inputs);
    }

    function renderResults(aussen, steps) {
        let html = `<h2>Anlagenprozess & Zustände</h2>`;
        if (steps.length === 0) {
            html += `<div class="process-overview process-success">Idealzustand: Keine Luftbehandlung erforderlich.</div>`;
        } else {
            const overview = steps.map(s => s.name.split(' ')[1]).join(' → ');
            html += `<div class="process-overview process-info">Prozesskette: ${overview}</div>`;
            const createResultItem = (label, value, unit) => `<div class="result-item"><span class="label">${label}</span><span class="value">${value} ${unit}</span></div>`;
            const createStateBlock = (state) => createResultItem('Temperatur', state.t.toFixed(1), '°C') + createResultItem('Relative Feuchte', state.rh.toFixed(1), '%') + createResultItem('Absolute Feuchte', state.x.toFixed(2), 'g/kg') + createResultItem('Enthalpie', state.h.toFixed(2), 'kJ/kg');
            
            html += `<div class="process-step"><h4>🌍 Außenluft (Start)</h4><div class="result-grid">${createStateBlock(aussen)}</div></div>`;
            
            let heizleistungGesamt = 0;
            let heizschritte = 0;

            steps.forEach(step => {
                html += `<div class="process-step"><h4>${step.name}</h4><div class="result-grid">`;
                if (step.leistung > 0) {
                    html += createResultItem('Leistung', step.leistung.toFixed(2), 'kW');
                    if(step.name.includes('hitzer')) {
                        heizleistungGesamt += step.leistung;
                        heizschritte++;
                    }
                }
                if (step.kondensat > 0) html += createResultItem('Kondensat', step.kondensat.toFixed(2), 'kg/h');
                html += `</div><hr><h5>Zustand danach:</h5><div class="result-grid">${createStateBlock(step.stateAfter)}</div></div>`;
            });

            if(heizschritte > 1) {
                 html += `<div class="process-step summary"><h4>➕ Gesamt-Heizleistung</h4><div class="result-grid">`;
                 html += createResultItem('Leistung (VE + NE)', heizleistungGesamt.toFixed(2), 'kW');
                 html += `</div></div>`;
            }
        }
        dom.resultsCard.innerHTML = html;
    }

    function calculateAndRenderCosts(steps, inputs) {
        let heizLeistung = 0, kaelteLeistung = 0;
        steps.forEach(step => {
            if (step.name.includes('Vorerhitzer') || step.name.includes('Nacherhitzer')) heizLeistung += step.leistung;
            else if (step.name.includes('Kühler')) kaelteLeistung += step.leistung;
        });
        
        dom.powerDetailsContainer.innerHTML = `
            <div class="cost-display power-summary">
                <span class="cost-label">Gesamtleistung Wärme:</span>
                <span class="cost-value">${heizLeistung.toFixed(2)} kW</span>
            </div>
            <div class="cost-display power-summary">
                <span class="cost-label">Gesamtleistung Kälte:</span>
                <span class="cost-value">${kaelteLeistung.toFixed(2)} kW</span>
            </div>
        `;

        const kostenHeizung = heizLeistung * inputs.preisWaerme;
        const kostenKuehlung = (kaelteLeistung / inputs.eer) * inputs.preisStrom;
        currentTotalCost = kostenHeizung + kostenKuehlung;
        
        let costHtml = `
            <div class="cost-display">
                <span class="cost-label">Heizkosten:</span>
                <span class="cost-value">${kostenHeizung.toFixed(2)} €/h</span>
            </div>
            <div class="cost-display">
                <span class="cost-label">Kühlkosten:</span>
                <span class="cost-value">${kostenKuehlung.toFixed(2)} €/h</span>
            </div>
            <hr>
            <div class="cost-display total">
                <span class="cost-label">Gesamtkosten:</span>
                <span class="cost-value">${currentTotalCost.toFixed(2)} €/h</span>
            </div>
            <hr>
            <button id="setReferenceBtn" class="${referenceState ? 'activated' : ''}">${referenceState ? 'Referenz gesetzt' : 'Referenz festlegen'}</button>
        `;

        if (referenceState !== null) {
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost > 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            const changeClass = changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '');

            const deltaTemp = inputs.tempZuluft - referenceState.temp;
            const deltaRh = inputs.rhZuluft - referenceState.rh;
            const deltaVol = inputs.volumenstrom - referenceState.vol;

            costHtml += `
                <div class="cost-display change">
                    <span class="cost-label">Δ Kosten:</span>
                    <span class="cost-value ${changeClass}">${sign}${changeAbs.toFixed(2)} €/h (${sign}${changePerc.toFixed(1)} %)</span>
                </div>
                <div class="cost-display change parameter">
                    <span class="cost-label">Δ Temperatur:</span>
                    <span class="cost-value">${deltaTemp >= 0 ? '+' : ''}${deltaTemp.toFixed(1)} °C</span>
                </div>
                <div class="cost-display change parameter">
                    <span class="cost-label">Δ Feuchte:</span>
                    <span class="cost-value">${deltaRh >= 0 ? '+' : ''}${deltaRh.toFixed(1)} %</span>
                </div>
                <div class="cost-display change parameter">
                    <span class="cost-label">Δ Volumenstrom:</span>
                    <span class="cost-value">${deltaVol >= 0 ? '+' : ''}${deltaVol.toFixed(0)} m³/h</span>
                </div>
            `;
        }
        dom.costDetailsContainer.innerHTML = costHtml;
        document.getElementById('setReferenceBtn').addEventListener('click', handleSetReference);
    }

    function handleSetReference() {
        referenceState = {
            cost: currentTotalCost,
            temp: parseFloat(dom.tempZuluft.value),
            rh: parseFloat(dom.rhZuluft.value),
            vol: parseFloat(dom.volumenstrom.value)
        };
        dom.resetSlidersBtn.disabled = false;
        calculateAll();
    }
    
    function resetToDefaults() {
        dom.tempAussen.value = 20.0; dom.rhAussen.value = 50.0;
        dom.tempZuluft.value = 20.0; dom.rhZuluft.value = 50.0;
        dom.xZuluft.value = 7.26; dom.volumenstrom.value = 5000;
        dom.kuehlerAktiv.checked = true; dom.tempVorerhitzer.value = 5.0;
        dom.druck.value = 1013.25; dom.feuchteSollTyp.value = 'rh';
        dom.preisWaerme.value = 0.12; dom.preisStrom.value = 0.30;
        dom.eer.value = 3.5;
        
        dom.volumenstromSlider.max = 20000; // Reset max value
        dom.volumenstromSlider.value = 5000; dom.volumenstromLabel.textContent = 5000;
        dom.tempZuluftSlider.value = 20.0; dom.tempZuluftLabel.textContent = '20.0';
        dom.rhZuluftSlider.value = 50.0; dom.rhZuluftLabel.textContent = '50.0';

        referenceState = null;
        dom.resetSlidersBtn.disabled = true;
        handleKuehlerToggle();
        handleFeuchteSollChange();
    }
    
    function resetSlidersToRef() {
        if (!referenceState) return;
        
        dom.tempZuluft.value = referenceState.temp.toFixed(1);
        dom.rhZuluft.value = referenceState.rh.toFixed(1);
        dom.volumenstrom.value = referenceState.vol;

        // Manually trigger the 'input' event to sync everything
        dom.tempZuluft.dispatchEvent(new Event('input'));
        dom.rhZuluft.dispatchEvent(new Event('input'));
        dom.volumenstrom.dispatchEvent(new Event('input'));

        calculateAll();
    }

    function handleFeuchteSollChange() {
        const isRh = dom.feuchteSollTyp.value === 'rh';
        dom.rhZuluft.classList.toggle('hidden', !isRh);
        dom.xZuluft.classList.toggle('hidden', isRh);
        dom.rhZuluftSliderGroup.style.display = isRh ? 'block' : 'none';
        calculateAll();
    }

    function handleKuehlerToggle() {
        const isActive = dom.kuehlerAktiv.checked;
        dom.sollFeuchteWrapper.style.opacity = isActive ? '1' : '0.5';
        ['feuchteSollTyp', 'rhZuluft', 'xZuluft', 'rhZuluftSlider'].forEach(id => dom[id].disabled = !isActive);
        dom.rhZuluftSliderGroup.style.opacity = isActive ? '1' : '0.5';
        calculateAll();
    }

    function syncInputsAndSliders() {
        const sync = (slider, input, label, isFloat = false) => {
            // Slider changes Input
            slider.addEventListener('input', () => {
                const value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
                input.value = value;
                label.textContent = value;
                calculateAll();
            });
            // Input changes Slider
            input.addEventListener('input', () => {
                const newValue = parseFloat(input.value);
                if(isNaN(newValue)) return;
                
                // KORREKTUR: Dynamisches Anpassen der Obergrenze des Sliders
                if (newValue > parseFloat(slider.max)) {
                    slider.max = newValue;
                }

                slider.value = newValue;
                label.textContent = isFloat ? newValue.toFixed(1) : newValue;
                // calculateAll() is already called by the generic listener
            });
        };
        sync(dom.volumenstromSlider, dom.volumenstrom, dom.volumenstromLabel);
        sync(dom.tempZuluftSlider, dom.tempZuluft, dom.tempZuluftLabel, true);
        sync(dom.rhZuluftSlider, dom.rhZuluft, dom.rhZuluftLabel, true);
    }
    
    // Setup event listeners
    const allNumberInputs = [ dom.tempAussen, dom.rhAussen, dom.tempVorerhitzer, dom.druck, dom.preisWaerme, dom.preisStrom, dom.eer, dom.xZuluft, dom.volumenstrom, dom.tempZuluft, dom.rhZuluft ];
    allNumberInputs.forEach(input => {
        if (input) input.addEventListener('input', calculateAll);
    });
    
    dom.kuehlerAktiv.addEventListener('change', handleKuehlerToggle);
    dom.feuchteSollTyp.addEventListener('change', handleFeuchteSollChange);
    dom.resetBtn.addEventListener('click', resetToDefaults);
    dom.resetSlidersBtn.addEventListener('click', resetSlidersToRef);
    
    syncInputsAndSliders();
    handleKuehlerToggle();
});
