(function() {
    'use strict';

    let srcImage = null, srcData = null, resultData = null, resultBlob = null;
    let isProcessing = false, aspectRatio = 1;
    let progressTimer = null;

    const $ = id => document.getElementById(id);

    // ---- Cursor ----
    const cursor = $('customCursor');
    document.addEventListener('mousemove', e => {
        if (cursor) { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }
    });

    // ---- Inner Tab System ----
    function initInnerTabs(tabSel, contentMap) {
        document.querySelectorAll(tabSel).forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll(tabSel).forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const key = tab.dataset.inner;
                if (key && contentMap[key]) {
                    contentMap[key].style.display = 'block';
                    Object.keys(contentMap).forEach(k => {
                        if (k !== key) contentMap[k].style.display = 'none';
                    });
                }
            });
        });
    }

    const tradContent = {
        'trad-scale': $('trad-scale'),
        'trad-custom': $('trad-custom')
    };
    initInnerTabs('#tab-traditional .inner-tab', tradContent);

    // ---- Image Loading ----
    const dropZone = $('dropZone'), fileInput = $('fileInput');
    const previewOrig = $('previewOriginal'), previewRes = $('previewResult');
    const origSize = $('previewOriginalSize'), resSize = $('previewResultSize');
    const statusText = $('statusText');
    const progCont = $('progressContainer'), progBar = $('progressBar');
    const dlArea = $('downloadArea'), dlBtn = $('downloadBtn');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) loadImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) loadImage(fileInput.files[0]);
    });

    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) { setStatus('Select an image file', true); return; }
        clearResult();
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                srcImage = img;
                aspectRatio = img.width / img.height;
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                srcData = ctx.getImageData(0, 0, img.width, img.height);
                previewOrig.src = e.target.result;
                origSize.textContent = `${img.width} × ${img.height}`;
                dropZone.querySelector('p').textContent = 'Click or drop another image';
                setStatus(`Loaded: ${img.width}×${img.height} — ${file.name}`, false);
                enableButtons(true);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ---- Traditional Controls ----
    const methodSel = $('methodSelect');
    const scaleSel = $('scaleSelect');
    const customW = $('customWidth'), customH = $('customHeight'), aLock = $('aspectLock');
    const btnUp = $('btnUpscale');

    const methods = TradUpscaler.getMethodList();
    methods.forEach(m => {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = `${m.name} (${m.abbr})`; methodSel.appendChild(o);
    });
    const descEl = $('methodDesc');
    function updateDesc() {
        const m = methods.find(x => x.id === methodSel.value);
        if (descEl) descEl.textContent = m ? `${m.desc} [${m.abbr}]` : '';
    }
    methodSel.addEventListener('change', updateDesc);
    updateDesc();

    customW.addEventListener('input', () => { if (aLock.checked && srcImage) customH.value = Math.round(customW.value / aspectRatio); });
    customH.addEventListener('input', () => { if (aLock.checked && srcImage) customW.value = Math.round(customH.value * aspectRatio); });

    // ---- Helpers ----
    function setStatus(msg, err) { statusText.textContent = msg; statusText.style.color = err ? '#ff4444' : '#888'; }
    function setProgress(show, pct) { progCont.classList.toggle('active', show); progBar.style.width = pct + '%'; }
    function enableButtons(en) { btnUp.disabled = !en; }
    function clearResult() {
        resultData = null; resultBlob = null;
        previewRes.src = ''; resSize.textContent = ''; dlArea.classList.remove('active');
    }

    function getTargetSize() {
        const isScale = document.querySelector('#tab-traditional .inner-tab.active')?.dataset.inner === 'trad-scale';
        if (isScale) {
            const s = parseFloat(scaleSel.value);
            return { w: Math.round(srcData.width * s), h: Math.round(srcData.height * s) };
        }
        const w = parseInt(customW.value);
        const h = parseInt(customH.value);
        if (!w || !h || w < 1 || h < 1) throw new Error('Invalid dimensions (min 1)');
        if (w > 8000 || h > 8000) throw new Error('Max: 8000×8000');
        return { w, h };
    }

    // ---- Upscale ----
    function getMethodLabel(p) {
        const m = methods.find(x => x.id === p.method);
        return m ? m.name : p.method;
    }

    async function doUpscale(params) {
        if (isProcessing) return;
        if (!srcData) { setStatus('Load image first', true); return; }
        isProcessing = true;
        setProgress(true, 0); setStatus('Processing...', false);
        enableButtons(false); clearResult();

        let pct = 0;
        progressTimer = setInterval(() => { pct += Math.random() * 12; if (pct > 90) pct = 90; setProgress(true, pct); }, 200);

        try {
            const result = await new Promise((resolve, reject) => {
                setTimeout(() => {
                    try { resolve(TradUpscaler.upscale(srcData, params.w, params.h, params.method)); }
                    catch (e) { reject(e); }
                }, 30);
            });

            clearInterval(progressTimer); setProgress(true, 100);
            resultData = result;

            const c = document.createElement('canvas');
            c.width = result.width; c.height = result.height;
            c.getContext('2d').putImageData(result, 0, 0);

            const maxP = 600;
            if (result.width > maxP || result.height > maxP) {
                const r = Math.min(maxP / result.width, maxP / result.height);
                const pc = document.createElement('canvas');
                pc.width = Math.round(result.width * r);
                pc.height = Math.round(result.height * r);
                const pctx = pc.getContext('2d');
                pctx.imageSmoothingQuality = 'high';
                pctx.drawImage(c, 0, 0, pc.width, pc.height);
                previewRes.src = pc.toDataURL();
            } else {
                previewRes.src = c.toDataURL();
            }
            resSize.textContent = `${result.width} × ${result.height}`;

            lastAbbr = getMethodAbbr(params);

            c.toBlob(blob => { resultBlob = blob; dlArea.classList.add('active'); }, 'image/png');

            setStatus(`Done! ${result.width}×${result.height} — ${getMethodLabel(params)}`, false);
        } catch (e) {
            clearInterval(progressTimer); setProgress(false, 0);
            setStatus('Error: ' + e.message, true); console.error(e);
        } finally {
            isProcessing = false; enableButtons(true);
            setTimeout(() => setProgress(false, 0), 400);
        }
    }

    // ---- Button Handler ----
    btnUp.addEventListener('click', () => {
        try {
            const { w, h } = getTargetSize();
            doUpscale({ w, h, method: methodSel.value });
        } catch (e) { setStatus(e.message, true); }
    });

    // ---- Download ----
    let saveCounter = 0;
    let lastAbbr = 'SR';

    function getMethodAbbr(p) {
        const m = methods.find(x => x.id === p.method);
        return m ? m.abbr : 'SR';
    }

    function formatSize(bytes) {
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    function makeFilename() {
        const size = formatSize(resultBlob.size);
        const res = `${resultData.width}x${resultData.height}`;
        return `${size}_${res}_${lastAbbr}_${++saveCounter}.png`;
    }

    function triggerDownload(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name || makeFilename();
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    dlBtn.addEventListener('click', () => {
        if (!resultBlob) return;
        triggerDownload(resultBlob);
    });

    // ---- Save to Folder (File System Access API) ----
    const saveBtn = $('saveBtn');
    saveBtn.addEventListener('click', async () => {
        if (!resultBlob) return;
        const fname = makeFilename();
        try {
            if ('showSaveFilePicker' in window) {
                const opts = {
                    suggestedName: fname,
                    types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
                };
                const handle = await window.showSaveFilePicker(opts);
                const writable = await handle.createWritable();
                await writable.write(resultBlob);
                await writable.close();
                setStatus(`Saved: ${handle.name}`, false);
            } else {
                triggerDownload(resultBlob, fname);
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                triggerDownload(resultBlob, fname);
            }
        }
    });

    // ---- Batch Upscale ----
    const batchBtn = $('batchBtn');
    const batchModal = $('batchModal');
    const batchModalText = $('batchModalText');
    const batchConfirmBtn = $('batchConfirmBtn');
    const batchCancelBtn = $('batchCancelBtn');
    const batchFolderBtn = $('batchFolderBtn');
    const batchFolderInfo = $('batchFolderInfo');

    let batchDirHandle = null;

    function estimateSize(w, h) {
        return w * h * 4 * 1.02;
    }

    batchBtn.addEventListener('click', () => {
        if (!srcData) { setStatus('Load image first', true); return; }
        if (isProcessing) { setStatus('Already processing', true); return; }

        const s = parseFloat(scaleSel.value);
        const tw = Math.round(srcData.width * s);
        const th = Math.round(srcData.height * s);
        const perImage = estimateSize(tw, th);
        const total = perImage * methods.length;
        const totalMB = (total / (1024 * 1024)).toFixed(1);

        batchModalText.innerHTML =
            `Scale: <b>x${s}</b> (${tw}×${th})<br>` +
            `Methods: <b>${methods.length}</b><br>` +
            `Per image: ~<b>${(perImage / (1024 * 1024)).toFixed(1)} MB</b><br>` +
            `Total estimate: ~<b style="color:#ff4444;">${totalMB} MB</b>`;

        if (batchDirHandle) {
            batchFolderInfo.textContent = 'Save to: ' + batchDirHandle.name;
            batchFolderInfo.style.color = '#00ff00';
        }
        batchModal.style.display = 'flex';
    });

    batchFolderBtn.addEventListener('click', async () => {
        try {
            if ('showDirectoryPicker' in window) {
                batchDirHandle = await window.showDirectoryPicker();
                batchFolderInfo.textContent = 'Save to: ' + batchDirHandle.name;
                batchFolderInfo.style.color = '#00ff00';
            } else {
                alert('Folder picker not supported in this browser. Files will download individually.');
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                batchFolderInfo.textContent = 'Failed to choose folder';
                batchFolderInfo.style.color = '#ff4444';
            }
        }
    });

    batchCancelBtn.addEventListener('click', () => { batchModal.style.display = 'none'; });
    batchModal.addEventListener('click', (e) => { if (e.target === batchModal) batchModal.style.display = 'none'; });

    batchConfirmBtn.addEventListener('click', async () => {
        batchModal.style.display = 'none';
        if (!srcData || isProcessing) return;
        if (srcData.width * srcData.height > 1000000) {
            const yn = confirm('Large image — this may take a while. Continue?');
            if (!yn) return;
        }

        const s = parseFloat(scaleSel.value);
        const tw = Math.round(srcData.width * s);
        const th = Math.round(srcData.height * s);

        isProcessing = true;
        enableButtons(false);
        setProgress(true, 0);
        setStatus(`Batch: 0 / ${methods.length}`, false);

        let completed = 0;
        const results = [];

        for (const m of methods) {
            setStatus(`Batch: ${m.name} (${++completed}/${methods.length})`, false);
            setProgress(true, Math.round((completed - 1) / methods.length * 100));

            try {
                const imgData = await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        try { resolve(TradUpscaler.upscale(srcData, tw, th, m.id)); }
                        catch (e) { reject(e); }
                    }, 30);
                });

                const c = document.createElement('canvas');
                c.width = imgData.width; c.height = imgData.height;
                c.getContext('2d').putImageData(imgData, 0, 0);

                const blob = await new Promise(r => c.toBlob(r, 'image/png'));
                results.push({ method: m, imgData, blob });
            } catch (e) {
                setStatus(`Batch error on ${m.name}: ${e.message}`, true);
            }
        }

        setProgress(true, 100);

        if (results.length > 0) {
            resultData = results[0].imgData;
            resultBlob = results[0].blob;
            lastAbbr = results[0].method.abbr;

            const c = document.createElement('canvas');
            c.width = resultData.width; c.height = resultData.height;
            c.getContext('2d').putImageData(resultData, 0, 0);
            previewRes.src = c.toDataURL();
            resSize.textContent = `${resultData.width} × ${resultData.height}`;
            dlArea.classList.add('active');

            if (batchDirHandle && 'showDirectoryPicker' in window) {
                for (const r of results) {
                    const fname = `${formatSize(r.blob.size)}_${r.imgData.width}x${r.imgData.height}_${r.method.abbr}_${++saveCounter}.png`;
                    try {
                        const fileHandle = await batchDirHandle.getFileHandle(fname, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(r.blob);
                        await writable.close();
                    } catch (e) {
                        triggerDownload(r.blob, fname);
                    }
                }
                setStatus(`Batch done — ${results.length} files saved to ${batchDirHandle.name}`, false);
            } else {
                for (const r of results) {
                    const fname = `${formatSize(r.blob.size)}_${r.imgData.width}x${r.imgData.height}_${r.method.abbr}_${++saveCounter}.png`;
                    triggerDownload(r.blob, fname);
                }
                setStatus(`Batch done — ${results.length} files downloaded`, false);
            }
        }

        isProcessing = false;
        enableButtons(true);
        setTimeout(() => setProgress(false, 0), 400);
    });

    // ---- Time ----
    function updateDateTime() {
        const now = new Date();
        const t = $('currentTime'), d = $('currentDate');
        if (t) t.textContent = now.toLocaleTimeString('en-GB');
        if (d) d.textContent = now.toLocaleDateString('en-GB');
    }
    updateDateTime(); setInterval(updateDateTime, 1000);

})();
