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
        referenceDetails: document.getElementById('reference-details'),
        kostenAenderung: document.getElementById('kostenAenderung'),
        tempAenderung: document.getElementById('tempAenderung'),
        rhAenderung: document.getElementById('rhAenderung'),
        volumenAenderung: document.getElementById('volumenAenderung'),
        gesamtleistungWaerme: document.getElementById('gesamtleistungWaerme'),
        gesamtleistungKaelte: document.getElementById('gesamtleistungKaelte'),
        kostenHeizung: document.getElementById('kostenHeizung'),
        kostenKuehlung: document.getElementById('kostenKuehlung'),
        kostenGesamt: document.getElementById('kostenGesamt'),
        setReferenceBtn: document.getElementById('setReferenceBtn'),
    };

    const TOLERANCE = 0.01;

    // --- Psychrometric Functions (unchanged) ---
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

    // --- Main Calculation Function ---
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
            const createResultItem = (label, value, unit) => `<div class="result-item"><span class="label"><span class="math-inline">\{label\}</span\><span class\="value"\></span>{value} ${unit}</span></div>`;
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
        
        dom.gesamtleistungWaerme.textContent = `${heizLeistung.toFixed(2)} kW`;
        dom.gesamtleistungKaelte.textContent = `${kaelteLeistung.toFixed(2)} kW`;

        const kostenHeizung = heizLeistung * inputs.preisWaerme;
        const kostenKuehlung = (kaelteLeistung / inputs.eer) * inputs.preisStrom;
        currentTotalCost = kostenHeizung + kostenKuehlung;
        
        dom.kostenHeizung.textContent = `${kostenHeizung.toFixed(2)} €/h`;
        dom.kostenKuehlung.textContent = `${kostenKuehlung.toFixed(2)} €/h`;
        dom.kostenGesamt.textContent = `${currentTotalCost.toFixed(2)} €/h`;
        
        dom.setReferenceBtn.className = referenceState ? 'activated' : '';
        dom.setReferenceBtn.textContent = referenceState ? 'Neue Referenz setzen' : 'Referenz festlegen';

        if (referenceState) {
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost > 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            const changeClass = changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '');

            const deltaTemp = inputs.tempZuluft - referenceState.temp;
            const deltaRh = inputs.rhZuluft - referenceState.rh;
            const deltaVol = inputs.volumenstrom - referenceState.vol;

            dom.kostenAenderung.textContent = `<span class="math-inline">\{sign\}</span>{changeAbs.toFixed(2)} €/h (<span class="math-inline">\{sign\}</span>{changePerc.toFixed(1)} %)`;
            dom.kostenAenderung.className = `cost-value ${changeClass}`;
            dom.tempAenderung.textContent = `<span class="math-inline">\{deltaTemp \>\= 0 ? '\+' \: ''\}</span>{deltaTemp.toFixed(1)} °C`;
            dom.rhAenderung.textContent = `<span class="math-inline">\{deltaRh \>\= 0 ? '\+' \: ''\}</span>{deltaRh.toFixed(1)} %`;
            dom.volumenAenderung.textContent = `<span class="math-inline">\{deltaVol \>\= 0 ? '\+' \: ''\}</span>{deltaVol.toFixed(0)} m³/h`;
        } else {
            dom.kostenAenderung.textContent = '--';
            dom.tempAenderung.textContent = '--';
            dom.rhAenderung.textContent = '--';
            dom.volumenAenderung.textContent = '--';
            dom.kostenAenderung.className = 'cost-value';
        }
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
        referenceState = null; // Clear reference first
        dom.tempAussen.value = 20.0; dom.rhAussen.value = 50.0;
        dom.tempZuluft.value = 20.0; dom.rhZuluft.value = 50.0;
        dom.xZuluft.value = 7.26; dom.volumenstrom.value = 5000;
        dom.kuehlerAktiv.checked = true; dom.tempVorerhitzer.value = 5.0;
        dom.druck.value = 1013.25; dom.feuchteSollTyp.value = 'rh';
        dom.preisWaerme.value = 0.12; dom.preisStrom.value = 0.30;
        dom.eer.value = 3.5;
        
        dom.volumenstromSlider.max = 20000;
        
        resetSlidersToRef(true);
        
        dom.resetSlidersBtn.disabled = true;
        handleKuehlerToggle();
        handleFeuchteSollChange();
    }
    
    function resetSlidersToRef(toInitialDefaults = false) {
        let targetState;
        const initialDefaults = { temp: 20.0, rh: 50.0, vol: 5000 };
        
        if (toInitialDefaults || !referenceState) {
            targetState = initialDefaults;
        } else {
            targetState = referenceState;
        }

        dom.tempZuluft.value = targetState.temp.toFixed(1);
        dom.rhZuluft.value = targetState.rh.toFixed(1);
        dom.volumenstrom.value = targetState.vol;
        
        dom.tempZuluft.dispatchEvent(new Event('input'));
        dom.rhZuluft.dispatchEvent(new Event('input'));
        dom.volumenstrom.dispatchEvent(new Event('input'));
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
            slider.addEventListener('input', () => {
                const value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
                input.value = value;
                label.textContent = value;
                calculateAll();
            });
            input.addEventListener('input', () => {
                const newValue = parseFloat(input.value);
                if(
