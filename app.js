/**
 * GH-PC: 2D Product Configurator
 * Vanilla JS Arkitektur - Single Source of Truth
 */

// Globale variabler (Koordinater og skala) jf. instruktionerne
let gx = 100, gy = 100, gsk = 1.2;
let tx = 100, ty = 100, tsk = 1.2;
let sx = 100, sy = 100, ssk = 1.2;

// 1. STATE MANAGEMENT (Single Source of Truth)
const State = {
    vejen: { visible: true },
    gaden: { visible: true, fill: '#eef0ef' },
    torvet: { visible: true, fill: '#ffffff' },
    koerevejen: { 
        template: 'skabelon1.svg', 
        fill: '#ebe6e8', 
        strokeColor: '#000000', 
        strokeWidth: 0, 
        strokeStyle: 'solid' 
    },
    plantehuller: { count: 0, items: [] }, // Array af {id, x, y, rot}
    bump: [], // Array af {id, type, x, y, size, color}
    selectedBumpId: null,
    zoom: 1,
    pan: { x: 0, y: 0 }
};

// Referencer til DOM
const svgCanvas = document.getElementById('gh-canvas');
const masterTransform = document.getElementById('master-transform');

// 2. INITIALISERING & ASYNKRON SVG FETCHING
async function init() {
    setupEventListeners();
    await fetchAndRenderStaticLayers();
    applyStateToUI();
    renderAll();
}

async function fetchSVGContent(url) {
    try {
        const response = await fetch(`img/${url}`);
        if (!response.ok) return null;
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        // Udtræk de indre stier/polygoner
        return doc.querySelector('svg').innerHTML;
    } catch (e) {
        console.error(`Kunne ikke hente ${url}`, e);
        return null;
    }
}

async function fetchAndRenderStaticLayers() {
    // Gaden
    const gadenContent = await fetchSVGContent('gaden.svg');
    if(gadenContent) {
        const gLayer = document.getElementById('layer-gaden');
        gLayer.innerHTML = gadenContent;
        gLayer.setAttribute('transform', `translate(${gx}, ${gy}) scale(${gsk})`);
        ensurePathElement(gLayer); // Gør klar til matematisk path-tracing
    }

    // Torvet
    const torvetContent = await fetchSVGContent('torvet.svg');
    if(torvetContent) {
        const tLayer = document.getElementById('layer-torvet');
        tLayer.innerHTML = torvetContent;
        tLayer.setAttribute('transform', `translate(${tx}, ${ty}) scale(${tsk})`);
    }

    // Kørevejen (Standard skabelon)
    await loadKoerevejTemplate();
}

async function loadKoerevejTemplate() {
    const content = await fetchSVGContent(State.koerevejen.template);
    if(content) {
        const sLayer = document.getElementById('layer-koerevejen');
        sLayer.innerHTML = content;
        sLayer.setAttribute('transform', `translate(${sx}, ${sy}) scale(${ssk})`);
        renderKoerevejenStyles();
    }
}

// Hjælpefunktion: Konverterer polygoner til <path>, da getTotalLength() er påkrævet til plantehuller
function ensurePathElement(groupEl) {
    const polygons = groupEl.querySelectorAll('polygon');
    polygons.forEach(poly => {
        const pts = poly.getAttribute('points').trim().split(/\s+|,/);
        let d = `M ${pts[0]} ${pts[1]} `;
        for(let i=2; i<pts.length; i+=2) {
            if(pts[i] && pts[i+1]) d += `L ${pts[i]} ${pts[i+1]} `;
        }
        d += 'Z';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', poly.getAttribute('class') || '');
        poly.replaceWith(path);
    });
}


// 3. RENDERING MOTOR (Opdaterer DOM baseret på State)
function renderAll() {

    // Opsætning af svg_1
    const svg1 = document.getElementById('svg_1');
    if (svg1) {
        svg1.setAttribute('x', '0');
        svg1.setAttribute('y', '0');
        svg1.setAttribute('width', '4000');
        svg1.setAttribute('height', '1763');
    }

    // Opsætning af image
    const imageLayer = document.querySelector('image[href="img/vejen.svg"]');
    if (imageLayer) {
        imageLayer.setAttribute('x', '0');
        imageLayer.setAttribute('y', '0');
        imageLayer.setAttribute('width', '4000');
        imageLayer.setAttribute('height', '1763');
        imageLayer.setAttribute('preserveAspectRatio', 'none');
    }


    // 0. Vejen
    document.getElementById('layer-vejen').style.display = State.vejen.visible ? 'block' : 'none';
    
    // 1. Gaden
    const gLayer = document.getElementById('layer-gaden');
    gLayer.style.display = State.gaden.visible ? 'block' : 'none';
    Array.from(gLayer.children).forEach(child => {
        // Hvid-sort palette simuleres ved at tillade css-color assignment
        child.setAttribute('fill', State.gaden.fill);
    });

    // 2. Torvet
    const tLayer = document.getElementById('layer-torvet');
    tLayer.style.display = State.torvet.visible ? 'block' : 'none';
    Array.from(tLayer.children).forEach(child => {
        child.setAttribute('fill', State.torvet.fill);
        // Torvets specifikke edge-marker constraint
        child.setAttribute('stroke', '#000'); 
        child.setAttribute('stroke-width', '2');
    });

    // 3. Kørevejen
    renderKoerevejenStyles();

    // 4 & 5. Interaktive elementer
    renderBump();
    renderPlantehullerVisually();
    updateZoomPan();
}

function renderKoerevejenStyles() {
    const sLayer = document.getElementById('layer-koerevejen');
    Array.from(sLayer.children).forEach(child => {
        child.setAttribute('fill', State.koerevejen.fill);
        child.setAttribute('stroke', State.koerevejen.strokeColor);
        child.setAttribute('stroke-width', State.koerevejen.strokeWidth);
        child.setAttribute('stroke-dasharray', State.koerevejen.strokeStyle === 'dashed' ? '15,15' : 'none');
        child.setAttribute('stroke-linejoin', 'round'); // Sikrer pæne hjørner ved offset-illusion
    });
}


// 4. MATEMATISK DISTRIBUTIONS ALGORITME (Plantehuller)
function generatePlantehuller() {
    State.plantehuller.items = [];
    const count = parseInt(State.plantehuller.count);
    if (count === 0) return renderPlantehullerVisually();

    // Find omkredsen på Gaden (kræver at den er indlæst som path)
    const gPath = document.querySelector('#layer-gaden path');
    if(!gPath) return;

    const totalLength = gPath.getTotalLength();
    const step = totalLength / count;

    for (let i = 0; i < count; i++) {
        const pt = gPath.getPointAtLength(i * step);
        const ptNext = gPath.getPointAtLength((i * step) + 1); // Beregn tangent
        
        // Find vinkel ud fra vektoren mellem pt og ptNext
        const angleRad = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
        const angleDeg = (angleRad * 180 / Math.PI) + 90; // +90 for at vende halvcirklen udad

        // Transformér fra Gadens lokale koordinatsystem (påvirket af gx, gy, gsk) til master canvas koordinater
        const globalX = (pt.x * gsk) + gx;
        const globalY = (pt.y * gsk) + gy;

        State.plantehuller.items.push({
            id: 'ph_' + Date.now() + '_' + i,
            x: globalX,
            y: globalY,
            rot: angleDeg
        });
    }
    renderPlantehullerVisually();
}

function renderPlantehullerVisually() {
    const layer = document.getElementById('layer-plantehuller');
    layer.innerHTML = '';
    
    State.plantehuller.items.forEach(ph => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${ph.x}, ${ph.y}) rotate(${ph.rot})`);
        g.setAttribute('class', 'draggable');
        g.dataset.id = ph.id;
        g.dataset.type = 'plantehul';

        // Halvcirkel path SVG syntaks
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M -20 0 A 20 20 0 0 1 20 0 Z');
        path.setAttribute('fill', '#3e8e41');
        path.setAttribute('stroke', '#1b4d21');
        path.setAttribute('stroke-width', '2');
        
        g.appendChild(path);
        layer.appendChild(g);
    });
}

function renderBump() {
    const layer = document.getElementById('layer-bump');
    layer.innerHTML = '';

    State.bump.forEach(b => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', b.type === 'circle' ? 'circle' : 'rect');
        el.setAttribute('class', `draggable ${b.id === State.selectedBumpId ? 'selected-element' : ''}`);
        el.setAttribute('fill', b.color);
        el.dataset.id = b.id;
        el.dataset.type = 'bump';

        if (b.type === 'circle') {
            el.setAttribute('cx', b.x);
            el.setAttribute('cy', b.y);
            el.setAttribute('r', b.size);
        } else {
            el.setAttribute('x', b.x - (b.size/2));
            el.setAttribute('y', b.y - (b.size/2));
            el.setAttribute('width', b.size);
            el.setAttribute('height', b.size);
        }
        layer.appendChild(el);
    });
}


// 5. EVENT LISTENERS & BRUGERGRÆNSEFLADE
function setupEventListeners() {
    // Toggle Synlighed & Farver
    document.getElementById('toggle-vejen').addEventListener('change', e => { State.vejen.visible = e.target.checked; renderAll(); });
    document.getElementById('toggle-gaden').addEventListener('change', e => { State.gaden.visible = e.target.checked; renderAll(); });
    document.getElementById('gaden-color').addEventListener('input', e => { State.gaden.fill = e.target.value; renderAll(); });
    
    document.getElementById('toggle-torvet').addEventListener('change', e => { State.torvet.visible = e.target.checked; renderAll(); });
    document.getElementById('torvet-color').addEventListener('input', e => { State.torvet.fill = e.target.value; renderAll(); });

    // Kørevejen
    document.getElementById('koerevejen-template').addEventListener('change', async e => { 
        State.koerevejen.template = e.target.value; 
        await loadKoerevejTemplate(); 
    });
    document.getElementById('koerevejen-fill').addEventListener('input', e => { State.koerevejen.fill = e.target.value; renderAll(); });
    document.getElementById('koerevejen-stroke-color').addEventListener('input', e => { State.koerevejen.strokeColor = e.target.value; renderAll(); });
    document.getElementById('koerevejen-stroke-width').addEventListener('input', e => { State.koerevejen.strokeWidth = e.target.value; renderAll(); });
    document.getElementById('koerevejen-stroke-style').addEventListener('change', e => { State.koerevejen.strokeStyle = e.target.value; renderAll(); });

    // Plantehuller Slider
    document.getElementById('plantehuller-slider').addEventListener('change', e => {
        State.plantehuller.count = e.target.value;
        document.getElementById('plantehuller-val').innerText = State.plantehuller.count;
        generatePlantehuller();
    });

    // Bump
    document.getElementById('add-bump-circle').addEventListener('click', () => addBump('circle'));
    document.getElementById('add-bump-rect').addEventListener('click', () => addBump('rect'));
    document.getElementById('bump-size').addEventListener('input', e => updateSelectedBump('size', e.target.value));
    document.getElementById('bump-color').addEventListener('input', e => updateSelectedBump('color', e.target.value));
    document.getElementById('delete-bump').addEventListener('click', deleteSelectedBump);

    // Skins
    document.getElementsByName('skin').forEach(radio => {
        radio.addEventListener('change', e => {
            document.getElementById('skin-stylesheet').href = e.target.value;
            State.skin = e.target.value;
        });
    });

    // Zoom
    document.getElementById('zoom-in').addEventListener('click', () => { State.zoom *= 1.2; updateZoomPan(); });
    document.getElementById('zoom-out').addEventListener('click', () => { State.zoom /= 1.2; updateZoomPan(); });

    // Logo Interaktion
    const logoContainer = document.getElementById('gh-logo-container');
    const logoTooltip = document.getElementById('gh-logo-tooltip');
    let logoTimer;
    
    logoContainer.addEventListener('mouseenter', () => logoTooltip.style.display = 'block');
    logoContainer.addEventListener('mouseleave', () => logoTooltip.style.display = 'none');
    logoContainer.addEventListener('click', () => {
        if (logoTooltip.style.display === 'block') {
            logoTooltip.style.display = 'none';
            clearTimeout(logoTimer);
        } else {
            logoTooltip.style.display = 'block';
            logoTimer = setTimeout(() => logoTooltip.style.display = 'none', 20000);
        }
    });

    // Træk og Slip (Drag API) for Canvas
    setupDragLogic();
    
    // Arkiv & Publicering
    document.getElementById('btn-publish').addEventListener('click', publishDesign);
    document.getElementById('btn-load-list').addEventListener('click', loadDesignList);
}

// DRAG & DROP LOGIK I SVG
function setupDragLogic() {
    let activeElement = null;
    let offset = { x: 0, y: 0 };

    function getMousePosition(evt) {
        const CTM = svgCanvas.getScreenCTM();
        // Juster musens position ift matrix transform, vigtigt for at bevare 1:1 mapping uanset zoom
        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    }

    svgCanvas.addEventListener('pointerdown', evt => {
        const target = evt.target.closest('.draggable');
        if (target) {
            activeElement = target;
            const mousePos = getMousePosition(evt);
            
            if(target.dataset.type === 'bump') {
                State.selectedBumpId = target.dataset.id;
                document.getElementById('bump-editor').style.display = 'block';
                // Opdater toolbox felter
                const b = State.bump.find(x => x.id === State.selectedBumpId);
                if(b) {
                    document.getElementById('bump-size').value = b.size;
                    document.getElementById('bump-color').value = b.color;
                }
                offset.x = mousePos.x - b.x;
                offset.y = mousePos.y - b.y;
            } else if (target.dataset.type === 'plantehul') {
                const ph = State.plantehuller.items.find(x => x.id === target.dataset.id);
                offset.x = mousePos.x - ph.x;
                offset.y = mousePos.y - ph.y;
            }
            renderAll(); // Genrender for selected styling
        } else {
            // Afvælg bump hvis man klikker ved siden af
            State.selectedBumpId = null;
            document.getElementById('bump-editor').style.display = 'none';
            renderAll();
        }
    });

    svgCanvas.addEventListener('pointermove', evt => {
        if (activeElement) {
            evt.preventDefault();
            const coord = getMousePosition(evt);
            
            if(activeElement.dataset.type === 'bump') {
                const b = State.bump.find(x => x.id === activeElement.dataset.id);
                b.x = coord.x - offset.x;
                b.y = coord.y - offset.y;
                renderBump();
            } else if (activeElement.dataset.type === 'plantehul') {
                const ph = State.plantehuller.items.find(x => x.id === activeElement.dataset.id);
                ph.x = coord.x - offset.x;
                ph.y = coord.y - offset.y;
                renderPlantehullerVisually();
            }
        }
    });

    svgCanvas.addEventListener('pointerup', () => activeElement = null);
    svgCanvas.addEventListener('pointerleave', () => activeElement = null);
    
    // Dobbeltklik for at slette plantehul (Brugervenlig feature fra prompt)
    svgCanvas.addEventListener('dblclick', evt => {
        const target = evt.target.closest('.draggable');
        if(target && target.dataset.type === 'plantehul') {
            State.plantehuller.items = State.plantehuller.items.filter(x => x.id !== target.dataset.id);
            renderPlantehullerVisually();
        }
    });
}

function updateZoomPan() {
    masterTransform.setAttribute('transform', `scale(${State.zoom}) translate(${State.pan.x}, ${State.pan.y})`);
}

function addBump(type) {
    const newBump = {
        id: 'bump_' + Date.now(),
        type: type,
        x: 2000, // Spawn i midten af lærredet
        y: 800,
        size: 50,
        color: '#ff0000'
    };
    State.bump.push(newBump);
    State.selectedBumpId = newBump.id;
    
    document.getElementById('bump-editor').style.display = 'block';
    document.getElementById('bump-size').value = newBump.size;
    document.getElementById('bump-color').value = newBump.color;
    
    renderBump();
}

function updateSelectedBump(key, value) {
    const b = State.bump.find(x => x.id === State.selectedBumpId);
    if(b) {
        b[key] = key === 'size' ? parseInt(value) : value;
        renderBump();
    }
}

function deleteSelectedBump() {
    State.bump = State.bump.filter(x => x.id !== State.selectedBumpId);
    State.selectedBumpId = null;
    document.getElementById('bump-editor').style.display = 'none';
    renderBump();
}

function applyStateToUI() {
    document.getElementById('toggle-vejen').checked = State.vejen.visible;
    document.getElementById('toggle-gaden').checked = State.gaden.visible;
    document.getElementById('gaden-color').value = State.gaden.fill;
    document.getElementById('toggle-torvet').checked = State.torvet.visible;
    document.getElementById('torvet-color').value = State.torvet.fill;
    
    document.getElementById('koerevejen-template').value = State.koerevejen.template;
    document.getElementById('koerevejen-fill').value = State.koerevejen.fill;
    document.getElementById('koerevejen-stroke-color').value = State.koerevejen.strokeColor;
    document.getElementById('koerevejen-stroke-width').value = State.koerevejen.strokeWidth;
    document.getElementById('koerevejen-stroke-style').value = State.koerevejen.strokeStyle;
    
    document.getElementById('plantehuller-val').innerText = State.plantehuller.count;
    document.getElementById('plantehuller-slider').value = State.plantehuller.count;
    document.querySelector(`input[name="skin"][value="${State.skin}"]`).checked = true;
    document.getElementById('skin-stylesheet').href = State.skin;
}

// 6. PUBLICERING & ARKIVERING VIA GITHUB/VERCEL
async function publishDesign() {
    const name = document.getElementById('pub-name').value;
    const motivation = document.getElementById('pub-motivation').value;

    if (!name) return alert('Du skal angive et navn for designet.');

    const pubData = {
        Navn: name,
        Dato: new Date().toISOString(),
        Motivation: motivation,
        Designet: State // Inkluderer hele staten, inkl. bump koordinater
    };

    try {
        const response = await fetch('/api/update-github-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newData: pubData }) // Direkte ukrypteret JSON[cite: 13]
        });
        
        const result = await response.json();
        if (result.success) {
            alert('Designforslag publiceret til arkivet!');
        } else {
            console.error('API fejl:', result.error);
            alert('Der opstod en fejl ved publicering.');
        }
    } catch (error) {
        console.error('Netværksfejl:', error);
        alert('Netværksfejl. Kunne ikke forbinde til Vercel.');
    }
}

async function loadDesignList() {
    try {
        const response = await fetch('data/data.json');
        if (!response.ok) throw new Error('Datafil ikke fundet');
        const data = await response.json();
        
        const ul = document.getElementById('archive-list');
        ul.innerHTML = '';
        
        if(Array.isArray(data)) {
            data.forEach((design, index) => {
                const li = document.createElement('li');
                li.innerText = `${design.Navn} (${new Date(design.Dato).toLocaleDateString()})`;
                li.title = design.Motivation;
                li.addEventListener('click', () => loadStateFromArchive(design.Designet));
                ul.appendChild(li);
            });
        }
    } catch (e) {
        console.error('Kunne ikke hente arkivet', e);
        alert('Arkivet er endnu tomt eller kunne ikke indlæses.');
    }
}

async function loadStateFromArchive(archivedState) {
    if(confirm('Vil du overskrive dit nuværende lærred med dette design?')) {
        Object.assign(State, archivedState);
        applyStateToUI();
        await loadKoerevejTemplate(); // Hvis skabelonen er skiftet
        renderAll();
    }
}

// Opstart
window.addEventListener('DOMContentLoaded', init);