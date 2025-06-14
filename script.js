document.addEventListener('DOMContentLoaded', () => {

    let referenceState = null;
    let currentTotalCost = 0;

    const dom = {
        tempAussen: document.getElementById('tempAussen'), rhAussen: document.getElementById('rhAussen'),
        tempZuluft: document.getElementById('tempZuluft'), rhZuluft: document.getElementById('rhZuluft'),
        xZuluft: document.getElementById('xZuluft'), volumenstrom: document.getElementById('volumenstrom'),
        kuehlerAktiv: document.getElementById('kuehlerAktiv'), tempVorerhitzer: document.getElementById('tempVorerhitzer'),
        druck: document.getElementById('druck'), feuchteSollTyp: document.getElementById('feuchteSollTyp'),
        sollFeuchteWrapper: document.getElementById('sollFeuchteWrapper'),
        resetBtn: document.getElementById('resetBtn'), preisWaerme: document.getElementById('preisWaerme'),
        preisStrom: document.getElementById('preisStrom'), eer: document.getElementById('eer'),
        volumenstromSlider: document.getElementById('volumenstromSlider'), tempZuluftSlider: document.getElementById('tempZuluftSlider'),
        rhZuluftSlider: document.getElementById('rhZuluftSlider'), volumenstromLabel: document.getElementById('volumenstromLabel'),
        tempZuluftLabel: document.getElementById('tempZuluftLabel'), rhZuluftLabel: document.getElementById('rhZuluftLabel'),
        rhZuluftSliderGroup: document.getElementById('rhZuluftSliderGroup'),
        resetSlidersBtn: document.getElementById('resetSlidersBtn'),
        resultsCard: document.getElementById('results-card'),
        processOverviewContainer: document.getElementById('process-overview-container'),
        stateNode0: { t: document.getElementById('res-t-0'), rh: document.getElementById('res-rh-0'), x: document.getElementById('res-x-0')},
        compVE: { node: document.getElementById('comp-ve'), p: document.getElementById('res-p-ve') },
        stateNode1: { t: document.getElementById('res-t-1'), rh: document.getElementById('res-rh-1'), x: document.getElementById('res-x-1') },
        compK: { node: document.getElementById('comp-k'), p: document.getElementById('res-p-k'), kondensat: document.getElementById('res-kondensat') },
        stateNode2: { t: document.getElementById('res-t-2'), rh: document.getElementById('res-rh-2'), x: document.getElementById('res-x-2') },
        compNE: { node: document.getElementById('comp-ne'), p: document.getElementById('res-p-ne') },
        stateNode3: { t: document.getElementById('res-t-3'), rh: document.getElementById('res-rh-3'), x: document.getElementById('res-x-3') },
        stateNodeFinal: { t: document.getElementById('res-t-final'), rh: document.getElementById('res-rh-final'), x: document.getElementById('res-x-final') },
        referenceDetails: document.getElementById('reference-details'),
        kostenAenderung: document.getElementById('kostenAenderung'), tempAenderung: document.getElementById('tempAenderung'),
        rhAenderung: document.getElementById('rhAenderung'), volumenAenderung: document.getElementById('volumenAenderung'),
        gesamtleistungWaerme: document.getElementById('gesamtleistungWaerme'), gesamtleistungKaelte: document.getElementById('gesamtleistungKaelte'),
        kostenHeizung: document.getElementById('kostenHeizung'), kostenKuehlung: document.getElementById('kostenKuehlung'),
        kostenGesamt: document.getElementById('kostenGesamt'), setReferenceBtn: document.getElementById('setReferenceBtn'),
    };

    const TOLERANCE = 0.01;

    function getPs(T) { if (T >= 0) return 611.2 * Math.exp((17.62 * T) / (243.12 + T)); else return 611.2 * Math.exp((22.46 * T) / (272.62 + T)); }
    function getX(T, rH, p) { if (p <= 0) return Infinity; const p_s = getPs(T); const p_v = (rH / 100) * p_s; if (p_v >= p) return Infinity; return 622 * (p_v / (p - p_v)); }
    function getRh(T, x, p) { if (p <= 0) return 0; const p_s = getPs(T); if (p_s <= 0) return 0; const p_v = (p * x) / (622 + x); return Math.min(100, (p_v / p_s) * 100); }
    function getTd(x, p) { const p_v = (p * x) / (622 + x); if (p_v < 611.2) return -60; const log_pv_ratio = Math.log(p_v / 611.2); return (243.12 * log_pv_ratio) / (17.62 - log_pv_ratio); }
    function getH(T, x_g_kg) { if (!isFinite(x_g_kg)) return Infinity; const x_kg_kg = x_g_kg / 1000.0; return 1.006 * T + x_kg_kg * (2501 + 1.86 * T); }

    function calculateAll() {
        for (const field of [dom.tempAussen, dom.rhAussen, dom.tempZuluft, dom.rhZuluft, dom.xZuluft, dom.volumenstrom, dom.tempVorerhitzer, dom.druck, dom.preisWaerme, dom.preisStrom, dom.eer]) {
            if (field && field.offsetParent !== null && field.value === '') {
                dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler: Ein sichtbares Eingabefeld ist leer. Bitte alle Felder ausfüllen.</div>`;
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
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler: Ungültige Zahl in einem Eingabefeld.</div>`;
            return;
        }

        const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
        if (!isFinite(aussen.x)) {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler im Außenluft-Zustand. Prüfen Sie Temperatur, Feuchte und Luftdruck.</div>`;
            return;
        }
        aussen.h = getH(aussen.t, aussen.x);

        const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;
        const zuluftSoll = { t: inputs.tempZuluft };
        if (inputs.kuehlerAktiv) {
            if (inputs.feuchteSollTyp === 'rh') { zuluftSoll.rh = inputs.rhZuluft; zuluftSoll.x = getX(zuluftSoll.t, zuluftSoll.rh, inputs.druck); } 
            else { zuluftSoll.x = inputs.xZuluft; zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck); }
        } else {
            zuluftSoll.x = aussen.x; zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
        }
        zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

        let states = [aussen, null, null, null];
        let operations = { ve: { p: 0 }, k: { p: 0, kondensat: 0 }, ne: { p: 0 }};
        let currentState = { ...aussen };

        if (currentState.t < inputs.tempVorerhitzerSoll) {
            operations.ve.p = massenstrom_kg_s * (getH(inputs.tempVorerhitzerSoll, currentState.x) - currentState.h);
            currentState = {t: inputs.tempVorerhitzerSoll, h: getH(inputs.tempVorerhitzerSoll, currentState.x), x: currentState.x, rh: getRh(inputs.tempVorerhitzerSoll, currentState.x, inputs.druck)};
        }
        states[1] = { ...currentState };

        if (inputs.kuehlerAktiv && currentState.x > zuluftSoll.x + TOLERANCE) {
            const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
            const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
            operations.k.p = massenstrom_kg_s * (currentState.h - hNachKuehler);
            operations.k.kondensat = massenstrom_kg_s * (currentState.x - zuluftSoll.x) / 1000 * 3600;
            currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
        }
        states[2] = { ...currentState };

        if (currentState.t < zuluftSoll.t - TOLERANCE) {
            operations.ne.p = massenstrom_kg_s * (zuluftSoll.h - currentState.h);
            currentState = { ...zuluftSoll };
        }
        states[3] = { ...currentState };

        renderAll(states, operations, inputs);
    }

    function renderAll(states, operations, inputs) {
        updateStateNode(dom.stateNode0, states[0]);
        updateComponentNode(dom.compVE, operations.ve.p);
        updateStateNode(dom.stateNode1, states[1]);
        updateComponentNode(dom.compK, operations.k.p, operations.k.kondensat);
        updateStateNode(dom.stateNode2, states[2]);
        updateComponentNode(dom.compNE, operations.ne.p);
        updateStateNode(dom.stateNode3, states[3]);
        updateStateNode(dom.stateNodeFinal, states[3]);

        const activeSteps = Object.values(operations).filter(op => op.p > 0);
        if (activeSteps.length > 0) {
            const activeNames = Object.entries(operations).filter(([,op]) => op.p > 0).map(([key]) => key.toUpperCase());
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-info">Prozesskette: ${activeNames.join(' → ')}</div>`;
        } else {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-success">Idealzustand: Keine Luftbehandlung erforderlich.</div>`;
        }

        const heizLeistung = operations.ve.p + operations.ne.p;
        const kaelteLeistung = operations.k.p;
        
        dom.gesamtleistungWaerme.textContent = `${heizLeistung.toFixed(2)} kW`;
        dom.gesamtleistungKaelte.textContent = `${kaelteLeistung.toFixed(2)} kW`;

        const kostenHeizung = heizLeistung * inputs.preisWaerme;
        const kostenKuehlung = (kaelteLeistung / inputs.eer) * inputs.preisStrom;
        currentTotalCost = kostenHeizung + kostenKuehlung;
        
        dom.kostenHeizung.textContent = `${kostenHeizung.toFixed(2)} €/h`;
        dom.kostenKuehlung.textContent = `${kostenKuehlung.toFixed(2)} €/h`;
        dom.kostenGesamt.textContent = `${currentTotalCost.toFixed(2)} €/h`;
        
        dom.setReferenceBtn.className = referenceState ? 'activated' : '';
        dom.setReferenceBtn.textContent = referenceState ? 'Referenz gesetzt' : 'Referenz festlegen';

        if (referenceState) {
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost > 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            const changeClass = changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '');
            dom.kostenAenderung.textContent = `${sign}${changeAbs.toFixed(2)} €/h (${sign}${changePerc.toFixed(1)} %)`;
            dom.kostenAenderung.className = `cost-value ${changeClass}`;
            const deltaTemp = inputs.tempZuluft - referenceState.temp;
            dom.tempAenderung.textContent = `${deltaTemp >= 0 ? '+' : ''}${deltaTemp.toFixed(1)} °C`;
            const deltaRh = inputs.rhZuluft - referenceState.rh;
            dom.rhAenderung.textContent = `${deltaRh >= 0 ? '+' : ''}${deltaRh.toFixed(1)} %`;
            const deltaVol = inputs.volumenstrom - referenceState.vol;
            dom.volumenAenderung.textContent = `${deltaVol >= 0 ? '+' : ''}${deltaVol.toFixed(0)} m³/h`;
        } else {
            dom.kostenAenderung.textContent = '--';
            dom.tempAenderung.textContent = '--';
            dom.rhAenderung.textContent = '--';
            dom.volumenAenderung.textContent = '--';
            dom.kostenAenderung.className = 'cost-value';
        }
    }
    
    function updateStateNode(node, state) {
        node.t.textContent = state.t.toFixed(1);
        node.rh.textContent = state.rh.toFixed(1);
        node.x.textContent = state.x.toFixed(2);
    }
    function updateComponentNode(comp, power, kondensat = -1) {
        comp.p.textContent = power.toFixed(2);
        comp.node.classList.toggle('active', power > 0);
        comp.node.classList.toggle('inactive', power <= 0);
        if (kondensat >= 0) comp.kondensat.textContent = kondensat.toFixed(2);
    }

    function handleSetReference() {
        referenceState = { cost: currentTotalCost, temp: parseFloat(dom.tempZuluft.value), rh: parseFloat(dom.rhZuluft.value), vol: parseFloat(dom.volumenstrom.value) };
        dom.resetSlidersBtn.disabled = false;
        calculateAll();
    }
    
    function resetToDefaults() {
        referenceState = null;
        dom.resetSlidersBtn.disabled = true;

        dom.tempAussen.value = 20.0; dom.rhAussen.value = 50.0;
        dom.tempZuluft.value = 20.0; dom.rhZuluft.value = 50.0;
        dom.xZuluft.value = 7.26; dom.volumenstrom.value = 5000;
        dom.kuehlerAktiv.checked = true; dom.tempVorerhitzer.value = 5.0;
        dom.druck.value = 1013.25; dom.feuchteSollTyp.value = 'rh';
        dom.preisWaerme.value = 0.12; dom.preisStrom.value = 0.30;
        dom.eer.value = 3.5;
        
        dom.volumenstromSlider.max = 20000;
        syncAllSlidersToInputs();
        handleKuehlerToggle();
        handleFeuchteSollChange();
        calculateAll();
    }
    
    function resetSlidersToRef() {
        if (!referenceState) return;
        dom.tempZuluft.value = referenceState.temp.toFixed(1);
        dom.rhZuluft.value = referenceState.rh.toFixed(1);
        dom.volumenstrom.value = referenceState.vol;
        syncAllSlidersToInputs();
        calculateAll();
    }

    function handleFeuchteSollChange() {
        const isRh = dom.feuchteSollTyp.value === 'rh';
        dom.rhZuluft.classList.toggle('hidden', !isRh);
        dom.xZuluft.classList.toggle('hidden', isRh);
        dom.rhZuluftSliderGroup.style.display = isRh ? 'block' : 'none';
    }

    function handleKuehlerToggle() {
        const isActive = dom.kuehlerAktiv.checked;
        dom.sollFeuchteWrapper.style.opacity = isActive ? '1' : '0.5';
        ['feuchteSollTyp', 'rhZuluft', 'xZuluft', 'rhZuluftSlider'].forEach(id => dom[id].disabled = !isActive);
        dom.rhZuluftSliderGroup.style.opacity = isActive ? '1' : '0.5';
    }

    function syncSliderToInput(slider, input, label, isFloat = false) {
        const newValue = parseFloat(input.value);
        if(isNaN(newValue)) return;
        if (input.id === 'volumenstrom' && newValue > parseFloat(slider.max)) {
            slider.max = newValue;
        }
        slider.value = newValue;
        label.textContent = isFloat ? newValue.toFixed(1) : newValue;
    }
    
    function syncAllSlidersToInputs(){
        syncSliderToInput(dom.volumenstromSlider, dom.volumenstrom, dom.volumenstromLabel);
        syncSliderToInput(dom.tempZuluftSlider, dom.tempZuluft, dom.tempZuluftLabel, true);
        syncSliderToInput(dom.rhZuluftSlider, dom.rhZuluft, dom.rhZuluftLabel, true);
    }
    
    // --- INITIALIZATION ---
    function addEventListeners() {
        // Simple inputs that only trigger a recalculation
        const basicInputs = [ dom.tempAussen, dom.rhAussen, dom.tempVorerhitzer, dom.druck, dom.preisWaerme, dom.preisStrom, dom.eer, dom.xZuluft ];
        basicInputs.forEach(input => input.addEventListener('input', calculateAll));

        // Synced inputs (sliders and number boxes)
        [dom.volumenstrom, dom.tempZuluft, dom.rhZuluft].forEach(input => {
            input.addEventListener('input', () => { syncSliderToInput(dom[input.id+'Slider'], input, dom[input.id+'Label'], input.id !== 'volumenstrom'); calculateAll(); });
        });
        [dom.volumenstromSlider, dom.tempZuluftSlider, dom.rhZuluftSlider].forEach(slider => {
            slider.addEventListener('input', () => {
                const inputId = slider.id.replace('Slider', '');
                const isFloat = inputId !== 'volumenstrom';
                const value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
                dom[inputId].value = value;
                dom[inputId+'Label'].textContent = value;
                calculateAll();
            });
        });

        // Toggles and Selects
        dom.kuehlerAktiv.addEventListener('change', () => { handleKuehlerToggle(); calculateAll(); });
        dom.feuchteSollTyp.addEventListener('change', () => { handleFeuchteSollChange(); calculateAll(); });
        
        // Buttons
        dom.resetBtn.addEventListener('click', resetToDefaults);
        dom.resetSlidersBtn.addEventListener('click', resetSlidersToRef);
        dom.setReferenceBtn.addEventListener('click', handleSetReference);
    }

    addEventListeners();
    handleKuehlerToggle();
    handleFeuchteSollChange();
    calculateAll();
});
