// Photo d'avatar (lot 2) : fichier choisi sur la fiche joueur (appareil photo ou galerie d'Android), contrôlé, réduit
// pour le travail, puis écran de recadrage carré : glisser pour cadrer, pincer (ou +/−, molette) pour zoomer, VALIDER.
// La photo gardée fait 256 × 256 px (JPEG), enregistrée avec le joueur dans la base (avatar.photo, en data: URL).
// Une photo trop lourde ou illisible laisse un message clair sur la fiche.
import { store } from '../store.js';
import { esc, topBar } from '../dom.js';
import { go, goBackTo, refresh } from '../nav.js';
import { initialCrop, panBy, zoomAt, cropSource, imagePlacement, fitWithin, AVATAR_PX, ZOOM_MAX } from '../crop.js';

export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const WORK_PX = 1600; // côté maximal de l'image de travail (recadrage fluide, mémoire raisonnable)

const mo = n => (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
export const PHOTO_ERRORS = {
  heavy: size => `Photo trop lourde : ${mo(size)} Mo, ${mo(PHOTO_MAX_BYTES)} Mo au plus. Choisis-en une autre.`,
  notImage: 'Ce fichier n\'est pas une image. Choisis une photo (JPEG, PNG ou WebP).',
  unreadable: 'Photo illisible : fichier abîmé ou format inconnu. Choisis une photo JPEG, PNG ou WebP.',
};

/** Décode le fichier et le réduit à WORK_PX de côté : { url (blob:), w, h }. Lève si l'image est illisible. */
async function loadWorking(file) {
  let src = null, w = 0, h = 0, release = () => {};
  try {
    src = await createImageBitmap(file); // tient compte de l'orientation EXIF
    w = src.width; h = src.height; release = () => src.close();
  } catch (e) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (x) { URL.revokeObjectURL(url); throw new Error('illisible'); }
    src = img; w = img.naturalWidth; h = img.naturalHeight; release = () => URL.revokeObjectURL(url);
  }
  try {
    if (!w || !h) throw new Error('illisible');
    const t = fitWithin(w, h, WORK_PX);
    const cv = document.createElement('canvas');
    cv.width = t.w; cv.height = t.h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, t.w, t.h);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) throw new Error('illisible');
    return { url: URL.createObjectURL(blob), w: t.w, h: t.h };
  } finally { release(); }
}

/** Fichier choisi sur la fiche (app.js, événement « change ») : contrôles, puis écran de recadrage. */
export async function onPhotoFile(file) {
  const d = store.draft;
  if (!d) return;
  d.photoError = '';
  if (file.size > PHOTO_MAX_BYTES) { d.photoError = PHOTO_ERRORS.heavy(file.size); refresh(); return; }
  if (file.type && !file.type.startsWith('image/')) { d.photoError = PHOTO_ERRORS.notImage; refresh(); return; }
  d.photoBusy = true;
  refresh();
  try {
    const w = await loadWorking(file);
    closeCrop();
    store.crop = { ...initialCrop(w.w, w.h), src: w.url, owned: true, forId: d.forId };
    d.photoBusy = false;
    go('#/recadrage');
  } catch (e) {
    d.photoBusy = false;
    d.photoError = PHOTO_ERRORS.unreadable;
    refresh();
  }
}

/** Ouvre le recadrage sur une image déjà chargée (sommaire de maquette). */
export function openCrop(src, iw, ih, forId) {
  closeCrop();
  store.crop = { ...initialCrop(iw, ih), src, owned: false, forId };
}

function closeCrop() {
  const c = store.crop;
  if (c && c.owned) { try { URL.revokeObjectURL(c.src); } catch (e) { /* rien */ } }
  store.crop = null;
}

const backTo = c => `#/joueur/${c.forId || 'nouveau'}`;
const zoomText = z => `×${z.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

export function cropScreen() {
  const c = store.crop;
  if (!c) { go(store.draft ? backTo(store.draft) : '#/joueurs', { replace: true }); return ''; }
  return `<div class="screen has-dock">${topBar('Recadrer la photo', backTo(c))}
    <div class="pad crop">
      <div class="cframe" id="cframe" role="img" aria-label="Photo à recadrer : glisser pour cadrer, pincer pour zoomer"><img id="cimg" src="${esc(c.src)}" alt="" draggable="false"></div>
      <p class="note center">Glisse pour cadrer · pince pour zoomer. Le carré est l'avatar.</p>
      <div class="stepper czoom"><button type="button" data-act="crop-zoom" data-arg="-1" aria-label="Moins de zoom" ${c.zoom <= 1 ? 'disabled' : ''}>−</button>
        <output id="czoom">ZOOM ${zoomText(c.zoom)}</output>
        <button type="button" data-act="crop-zoom" data-arg="1" aria-label="Plus de zoom" ${c.zoom >= ZOOM_MAX ? 'disabled' : ''}>+</button></div>
    </div>
    <div class="dock" data-layer><div class="btns two"><button type="button" class="btn" data-act="crop-cancel">ANNULER</button><button type="button" class="btn primary" data-act="crop-ok">VALIDER</button></div></div>
  </div>`;
}

/** Après le rendu : place l'image et branche glisser / pincer / molette (sans redessiner l'écran pendant le geste). */
export function mountCrop() {
  const frame = document.getElementById('cframe');
  const img = document.getElementById('cimg');
  if (!frame || !img || !store.crop) return;
  const place = () => {
    const p = imagePlacement(store.crop, frame.clientWidth);
    img.style.width = `${p.width}px`;
    img.style.height = `${p.height}px`;
    img.style.transform = `translate(${p.left}px, ${p.top}px)`;
    const out = document.getElementById('czoom');
    if (out) out.textContent = `ZOOM ${zoomText(store.crop.zoom)}`;
    // Boutons − / + : à jour après un pincement (l'écran n'est pas redessiné pendant le geste).
    document.querySelectorAll('[data-act="crop-zoom"]').forEach(b => {
      b.disabled = Number(b.dataset.arg) > 0 ? store.crop.zoom >= ZOOM_MAX : store.crop.zoom <= 1;
    });
  };
  place();
  const pts = new Map();
  let last = null;
  const snap = () => {
    const a = [...pts.values()];
    if (a.length >= 2) return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
    return a.length ? { x: a[0].x, y: a[0].y, d: 0 } : null;
  };
  frame.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    try { frame.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    last = snap();
  });
  frame.addEventListener('pointermove', ev => {
    if (!pts.has(ev.pointerId) || !store.crop) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const now = snap();
    const r = frame.getBoundingClientRect();
    const F = frame.clientWidth;
    let c = store.crop;
    if (now.d && last && last.d) c = zoomAt(c, now.d / last.d, now.x - r.left, now.y - r.top, F);
    if (last) c = panBy(c, now.x - last.x, now.y - last.y, F);
    store.crop = c;
    last = now;
    place();
  });
  const up = ev => { pts.delete(ev.pointerId); last = snap(); };
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
  frame.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = frame.getBoundingClientRect();
    store.crop = zoomAt(store.crop, ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX - r.left, ev.clientY - r.top, frame.clientWidth);
    place();
  }, { passive: false });
}

export const actions = {
  'crop-zoom'(arg) {
    const c = store.crop;
    if (!c) return;
    const F = document.getElementById('cframe')?.clientWidth || 300;
    store.crop = zoomAt(c, Number(arg) > 0 ? 1.25 : 0.8, F / 2, F / 2, F);
    refresh();
  },
  'crop-cancel'() {
    const c = store.crop;
    closeCrop();
    goBackTo(c ? backTo(c) : '#/joueurs');
  },
  async 'crop-ok'() {
    const c = store.crop;
    const img = document.getElementById('cimg');
    if (!c || !img) return;
    const d = store.draft;
    let photo = null;
    try {
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = AVATAR_PX; cv.height = AVATAR_PX;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const { sx, sy, size } = cropSource(c);
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_PX, AVATAR_PX);
      photo = cv.toDataURL('image/jpeg', 0.86);
    } catch (e) { photo = null; }
    if (d) {
      if (photo) { d.avatar = { ...d.avatar, kind: 'photo', photo }; d.photoError = ''; }
      else d.photoError = PHOTO_ERRORS.unreadable;
    }
    closeCrop();
    goBackTo(backTo(c));
  },
};
