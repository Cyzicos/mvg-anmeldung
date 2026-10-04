(function () {
  'use strict';

  var form = document.getElementById('antrag');
  var sections = {};
  Array.prototype.forEach.call(form.querySelectorAll('.step'), function (s) { sections[s.getAttribute('data-key')] = s; });
  var TITEL = { anliegen: 'Anliegen', daten: 'Deine Daten', kind: 'Dein Kind', bank: 'Lastschrift', einw: 'Einwilligungen', pruefen: 'Prüfen' };
  var current = 'anliegen';

  function $(id) { return document.getElementById(id); }
  function val(name) { var el = form.elements[name]; return el && el.value !== undefined ? (el.value || '').trim() : ''; }
  function checked(name) { var el = form.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function visible(el) { var h = el.closest('[hidden]'); return !h || h.classList.contains('step'); }

  /* ---------- Zustand ---------- */
  function anliegen() { return checked('anliegen'); }
  function existing() { return anliegen() === 'kind' && checked('mitglied_status') === 'ja'; }
  function sequence() {
    var s = ['anliegen', 'daten'];
    if (anliegen() === 'kind') s.push('kind');
    s.push('bank', 'einw', 'pruefen');
    return s;
  }
  function bankNoetig() { return !existing() || checked('bank_geaendert') === 'ja'; }

  /* ---------- Startwerte ---------- */
  $('ts').value = Date.now();
  var heute = new Date();
  $('heute').textContent = heute.toLocaleDateString('de-DE');
  var iso = heute.getFullYear() + '-' + ('0' + (heute.getMonth() + 1)).slice(-2) + '-' + ('0' + heute.getDate()).slice(-2);
  Array.prototype.forEach.call(form.querySelectorAll('input[type=date]'), function (d) { d.max = iso; });

  /* ---------- Kinder (beliebig viele, höchstens 6) ---------- */
  var MAX_KINDER = 6, kindUid = 0;
  function kinder() { return Array.prototype.slice.call($('kinder').querySelectorAll('.kind')); }
  function kf(k, f) { return k.querySelector('[data-f="' + f + '"]'); }
  function kv(k, f) {
    var el = kf(k, f);
    if (el.type === 'radio' || el.type === 'checkbox') el = k.querySelector('[data-f="' + f + '"]:checked');
    return el ? el.value.trim() : '';
  }
  function nummeriere() {
    var alle = kinder();
    alle.forEach(function (k, i) {
      // Feldnamen kinder[0][vorname], kinder[1][vorname] … für senden.php
      Array.prototype.forEach.call(k.querySelectorAll('[data-f]'), function (el) { el.name = 'kinder[' + i + '][' + el.getAttribute('data-f') + ']'; });
      k.querySelector('.kind__titel').textContent = 'Kind ' + (i + 1);
      k.querySelector('.kind__head').hidden = alle.length < 2;
      // Ermäßigung ab dem 2. Kind automatisch; beim 1. Kind nur, wenn ein Geschwisterkind schon in Ausbildung ist
      k.querySelector('.kind__erm-wahl').hidden = i > 0;
      k.querySelector('.kind__erm-auto').hidden = i === 0;
      if (i > 0) kf(k, 'ermaessigung').checked = false;
    });
    $('kind-plus').hidden = alle.length >= MAX_KINDER;
    $('h-kind').textContent = alle.length > 1 ? 'Deine Kinder' : 'Dein Kind';
  }
  function nachnameVorschlagen() {   // Nachname des Elternteils als Vorschlag
    kinder().forEach(function (k) { if (!kf(k, 'name').value) kf(k, 'name').value = val('name'); });
  }
  function neuesKind() {
    var k = $('kind-vorlage').content.firstElementChild.cloneNode(true), uid = ++kindUid;
    Array.prototype.forEach.call(k.querySelectorAll('input:not([type=radio]):not([type=checkbox])'), function (el) { el.id = 'k' + uid + '_' + el.getAttribute('data-f'); });
    Array.prototype.forEach.call(k.querySelectorAll('label[data-for]'), function (l) { l.htmlFor = 'k' + uid + '_' + l.getAttribute('data-for'); });
    kf(k, 'geburtsdatum').max = iso;
    $('kinder').appendChild(k);
    nummeriere();
    nachnameVorschlagen();
    return k;
  }
  $('kind-plus').addEventListener('click', function () {
    if (kinder().length >= MAX_KINDER) return;
    var k = neuesKind(); updateUI();
    k.scrollIntoView({ behavior: 'smooth', block: 'start' });
    kf(k, 'status').focus({ preventScroll: true });
  });
  $('kinder').addEventListener('click', function (e) {
    if (!e.target.matches('.kind__entfernen')) return;
    e.target.closest('.kind').remove();
    nummeriere(); updateUI();
    $('kind-plus').hidden ? $('h-kind').focus() : $('kind-plus').focus();
  });
  neuesKind();

  /* ---------- Alter ---------- */
  function age(dateStr) {
    if (!dateStr) return null;
    var p = dateStr.split('-'), b = new Date(+p[0], +p[1] - 1, +p[2]), n = new Date();
    var a = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
    return a;
  }
  function isMinor() { if (existing()) return false; var a = age(val('geburtsdatum')); return a !== null && a < 18; }

  /* ---------- Oberfläche je nach Auswahl ---------- */
  function updateUI() {
    var a = anliegen(), ex = existing();
    $('mitglied-frage').hidden = a !== 'kind';
    Array.prototype.forEach.call(form.querySelectorAll('[data-neu]'), function (el) { el.hidden = ex; });
    $('daten-lead').hidden = !ex;
    $('h-daten').textContent = ex ? 'Wer ist bereits Mitglied?' : (a === 'kind' ? 'Deine Daten als Elternteil' : 'Deine Daten');
    $('vormund').hidden = !isMinor();
    $('unterschrift-label').textContent = isMinor() ? 'Vor- und Nachname der erziehungsberechtigten Person als Unterschrift' : 'Vor- und Nachname als Unterschrift';

    // Hinweis je nach Mitgliedsstatus
    var st = checked('mitglied_status');
    $('mitglied-hinweis').textContent = st === 'ja'
      ? 'Super, dann brauchst du dich nicht erneut anzumelden. Wir ordnen dich über Name und Adresse zu.'
      : (st === 'unklar'
        ? 'Kein Problem, der Vorstand prüft das. Bitte gib deine Daten vollständig an.'
        : 'Für die Ausbildung ist die Mitgliedschaft eines Elternteils nötig. Das Kind ist automatisch Mitglied und zahlt keinen Mitgliedsbeitrag.');

    $('eltern-aktiv-frage').hidden = !(a === 'kind' && (st === 'nein' || st === 'unklar'));

    // Kinder
    kinder().forEach(function (k) {
      var ks = kv(k, 'status');
      k.querySelector('.kind__bereich').hidden = !ks;
      k.querySelector('.kind__geschlecht').hidden = ks !== 'neu';
      k.querySelector('.kind__bisher').hidden = ks !== 'bestehend';
      k.querySelector('.kind__kurs-legend').textContent = ks === 'bestehend' ? 'Neue Ausbildung: Anmeldung zur' : 'Anmeldung zur';
      k.querySelector('.kind__instrument').hidden = kv(k, 'kurs') !== 'Instrumentalausbildung';
    });

    // Bank
    $('bank-frage').hidden = !ex;
    $('bank-block').hidden = !bankNoetig();
    $('bank-lead').textContent = ex
      ? 'Die Ausbildungsbeiträge ziehen wir mit dem bestehenden Lastschriftmandat ein.'
      : 'Mitgliedsbeitrag und Ausbildungsbeiträge werden per Lastschrift eingezogen. Das Mandat gilt auch für die Beträge der Jugendausbildung.';
    // Minderjährige können kein Lastschriftmandat erteilen: Kontoinhaber muss jemand anderes sein
    var minor = isMinor(), gl = $('gleich');
    if (minor && !gl.disabled) { gl.checked = false; gl.disabled = true; }
    else if (!minor && gl.disabled) { gl.disabled = false; gl.checked = true; }
    $('ki-minderjaehrig').hidden = !minor;
    $('kontoinhaber').hidden = gl.checked;

    // Fotos: Einwilligung gilt bei Kinderanmeldung für Elternteil und Kind
    $('bild-wer').textContent = a !== 'kind' ? 'von dir' : (kinder().length > 1 ? 'von dir und deinen Kindern' : 'von dir und deinem Kind');
    $('medien').hidden = checked('bildrechte') !== 'ja';
  }
  form.addEventListener('change', updateUI);
  form.addEventListener('input', function (e) { if (e.target.name === 'geburtsdatum') updateUI(); });

  /* ---------- IBAN ---------- */
  function cleanIban(s) { return (s || '').replace(/\s+/g, '').toUpperCase(); }
  function ibanValid(raw) {
    var s = cleanIban(raw);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    if (s.slice(0, 2) === 'DE' && s.length !== 22) return false;
    var r = s.slice(4) + s.slice(0, 4), rem = 0;
    for (var i = 0; i < r.length; i++) {
      var c = r.charAt(i), v = /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
      for (var j = 0; j < v.length; j++) rem = (rem * 10 + parseInt(v.charAt(j), 10)) % 97;
    }
    return rem === 1;
  }
  $('iban').addEventListener('input', function () {
    var s = cleanIban(this.value);
    this.value = s.replace(/(.{4})/g, '$1 ').trim();
    $('bic-feld').hidden = !s || s.slice(0, 2) === 'DE';
  });

  /* ---------- Fehleranzeige ---------- */
  function clearError(field) {
    field.classList.remove('is-invalid');
    var e = field.querySelector(':scope > .err'); if (e) e.remove();
    Array.prototype.forEach.call(field.querySelectorAll('[aria-invalid]'), function (i) { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); });
  }
  function showError(input, msg) {
    var field = input.closest('.field') || input.closest('fieldset') || input.parentNode;
    if (field.classList.contains('is-invalid')) return;
    field.classList.add('is-invalid');
    var p = document.createElement('span');
    p.className = 'err'; p.setAttribute('role', 'alert'); p.textContent = msg;
    p.id = 'err-' + (input.id || input.name).replace(/\W/g, '');
    field.appendChild(p);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', p.id);
  }
  function errorAfter(label, msg) {
    if (label.nextElementSibling && label.nextElementSibling.classList.contains('err')) return;
    var p = document.createElement('span'); p.className = 'err'; p.setAttribute('role', 'alert'); p.textContent = msg; label.after(p);
  }
  form.addEventListener('input', function (e) {
    var f = e.target.closest('.field, fieldset');
    if (f) clearError(f);
  });
  form.addEventListener('change', function (e) {
    var fs = e.target.closest('fieldset'); if (fs) clearError(fs);
    var c = e.target.closest('.check');
    if (c && c.nextElementSibling && c.nextElementSibling.classList.contains('err')) c.nextElementSibling.remove();
  });

  /* ---------- Validierung ---------- */
  function validate(key) {
    var section = sections[key], firstBad = null;
    function mark(el) { if (!firstBad || (el.compareDocumentPosition(firstBad) & Node.DOCUMENT_POSITION_FOLLOWING)) firstBad = el; }
    function bad(el, msg) { showError(el, msg); mark(el); }

    Array.prototype.forEach.call(section.querySelectorAll('input[required]'), function (el) {
      if (!visible(el)) return;
      if (el.type === 'radio') return;
      if (el.type === 'checkbox') {
        if (!el.checked) { errorAfter(el.closest('.check'), 'Bitte bestätigen, um fortzufahren.'); mark(el); }
        return;
      }
      if (!el.value.trim()) { bad(el, 'Bitte ausfüllen.'); return; }
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) bad(el, 'Bitte eine gültige E-Mail-Adresse eingeben.');
      if (el.name === 'plz' && !/^[0-9]{5}$/.test(el.value.trim())) bad(el, 'Bitte eine 5-stellige PLZ eingeben.');
    });

    var radios = {};
    Array.prototype.forEach.call(section.querySelectorAll('input[type=radio][required]'), function (r) { if (visible(r)) radios[r.name] = r; });
    Object.keys(radios).forEach(function (n) { if (!checked(n)) bad(radios[n], 'Bitte eine Auswahl treffen.'); });

    if (key === 'anliegen' && anliegen() === 'kind' && !checked('mitglied_status')) {
      bad(form.querySelector('[name=mitglied_status]'), 'Bitte eine Auswahl treffen.');
    }
    if (key === 'anliegen' && anliegen() === 'kind' && checked('mitglied_status') && checked('mitglied_status') !== 'ja' && !checked('eltern_aktiv')) {
      bad(form.querySelector('[name=eltern_aktiv]'), 'Bitte eine Auswahl treffen.');
    }
    if (key === 'daten' && isMinor() && !val('erziehungsberechtigt')) {
      bad(form.elements.erziehungsberechtigt, 'Bitte eine erziehungsberechtigte Person eintragen.');
    }
    if (key === 'kind') {
      kinder().forEach(function (k) {
        if (!kv(k, 'status')) { bad(kf(k, 'status'), 'Bitte eine Auswahl treffen.'); return; }
        if (kv(k, 'status') === 'neu' && !kv(k, 'geschlecht')) bad(kf(k, 'geschlecht'), 'Bitte eine Auswahl treffen.');
        ['vorname', 'name', 'geburtsdatum'].forEach(function (f) { if (!kv(k, f)) bad(kf(k, f), 'Bitte ausfüllen.'); });
        if (!kv(k, 'kurs')) bad(kf(k, 'kurs'), 'Bitte eine Ausbildung wählen.');
        if (kv(k, 'kurs') === 'Instrumentalausbildung') {
          if (!kv(k, 'instrument')) bad(kf(k, 'instrument'), 'Bitte das Instrument angeben.');
          if (!kv(k, 'miete')) bad(kf(k, 'miete'), 'Bitte eine Auswahl treffen.');
        }
      });
    }
    if (key === 'bank') {
      if (existing() && !checked('bank_geaendert')) bad(form.querySelector('[name=bank_geaendert]'), 'Bitte eine Auswahl treffen.');
      if (bankNoetig()) {
        if (!$('gleich').checked) {
          ['ki_vorname', 'ki_name', 'ki_strasse', 'ki_plz', 'ki_ort'].forEach(function (k) { if (!val(k)) bad(form.elements[k], 'Bitte ausfüllen.'); });
        }
        if (val('iban') && !ibanValid(val('iban'))) bad(form.elements.iban, 'Diese IBAN ist nicht gültig. Bitte prüfe sie auf Tippfehler.');
        if (val('iban') && cleanIban(val('iban')).slice(0, 2) !== 'DE') {
          if (!val('bic')) bad(form.elements.bic, 'Bei Konten außerhalb Deutschlands wird der BIC benötigt.');
          else if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(cleanIban(val('bic')))) bad(form.elements.bic, 'Der BIC hat 8 oder 11 Zeichen.');
        }
      }
    }
    if (key === 'einw' && checked('bildrechte') === 'ja' && !form.querySelector('[name="medien[]"]:checked')) {
      bad(form.querySelector('[name="medien[]"]'), 'Bitte mindestens ein Medium wählen oder „Nein“ auswählen.');
    }

    if (firstBad) {
      var target = firstBad.closest('.field, fieldset, .check') || firstBad;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { firstBad.focus({ preventScroll: true }); } catch (e) {}
      return false;
    }
    return true;
  }

  /* ---------- Zusammenfassung ---------- */
  function datumDe(s) { var p = (s || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; }
  function maskiert(i) { return i.slice(0, 4) + ' •••• •••• ' + i.slice(-4); }
  function summary() {
    var a = anliegen(), ex = existing(), g = [];
    var wasText = a === 'aktiv' ? 'Aktives Mitglied werden'
      : a === 'foerdernd' ? 'Förderndes Mitglied werden'
      : ex ? 'Kind zur Ausbildung anmelden (Elternteil ist bereits Mitglied)'
      : 'Kind zur Ausbildung anmelden, Elternteil wird ' + (checked('eltern_aktiv') === 'ja' ? 'aktives' : 'förderndes') + ' Mitglied' + (checked('mitglied_status') === 'unklar' ? ' (Mitgliedschaft wird vom Vorstand geprüft)' : '');
    g.push({ key: 'anliegen', titel: 'Anliegen', rows: [['Anmeldung', wasText]] });

    var d = [['Name', val('vorname') + ' ' + val('name')]];
    if (!ex) { d.push(['Geschlecht', checked('geschlecht')]); d.push(['Geburtsdatum', datumDe(val('geburtsdatum'))]); }
    if (isMinor()) d.push(['Erziehungsberechtigt', val('erziehungsberechtigt')]);
    d.push(['Anschrift', val('strasse') + ', ' + val('plz') + ' ' + val('ort')]);
    d.push(['E-Mail', val('email')]);
    if (val('telefon')) d.push(['Telefon', val('telefon')]);
    g.push({ key: 'daten', titel: 'Daten', rows: d });

    if (a === 'kind') {
      var alle = kinder();
      alle.forEach(function (kd, i) {
        var k = [['Name', kv(kd, 'vorname') + ' ' + kv(kd, 'name')], ['Geburtsdatum', datumDe(kv(kd, 'geburtsdatum'))], ['Ausbildung', kv(kd, 'kurs')]];
        if (kv(kd, 'kurs') === 'Instrumentalausbildung') { k.push(['Instrument', kv(kd, 'instrument')]); k.push(['Instrument mieten', kv(kd, 'miete')]); }
        if (i > 0) k.push(['Ermäßigung', 'ja (2. Kind oder weiteres)']);
        else if (kv(kd, 'ermaessigung')) k.push(['Ermäßigung', 'ja (Geschwisterkind schon in Ausbildung)']);
        g.push({ key: 'kind', titel: alle.length > 1 ? 'Kind ' + (i + 1) : 'Kind', rows: k });
      });
    }

    var bk = bankNoetig()
      ? [['IBAN', maskiert(cleanIban(val('iban')))], ['Kreditinstitut', val('bank')]]
      : [['Bank', 'wie bisher']];
    if (bankNoetig() && !$('gleich').checked) bk.unshift(['Kontoinhaber', val('ki_vorname') + ' ' + val('ki_name')]);
    g.push({ key: 'bank', titel: 'Lastschrift', rows: bk });

    var f = checked('bildrechte') === 'ja'
      ? 'Ja: ' + Array.prototype.map.call(form.querySelectorAll('[name="medien[]"]:checked'), function (c) { return c.value; }).join(', ')
      : 'Nein';
    g.push({ key: 'einw', titel: 'Einwilligungen', rows: [[a !== 'kind' ? 'Fotos und Videos' : (kinder().length > 1 ? 'Fotos und Videos (du und deine Kinder)' : 'Fotos und Videos (du und dein Kind)'), f]] });

    var box = $('zusammenfassung'); box.innerHTML = '';
    g.forEach(function (gr) {
      var wrap = document.createElement('div'); wrap.className = 'summary__group';
      var head = document.createElement('div'); head.className = 'summary__head';
      var h = document.createElement('h3'); h.textContent = gr.titel;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'summary__edit'; b.textContent = 'Ändern'; b.setAttribute('data-goto', gr.key);
      head.appendChild(h); head.appendChild(b); wrap.appendChild(head);
      var dl = document.createElement('dl');
      gr.rows.forEach(function (r) {
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      wrap.appendChild(dl); box.appendChild(wrap);
    });
  }

  /* ---------- Navigation ---------- */
  function go(key, initial) {
    current = key;
    updateUI();
    var seq = sequence(), idx = seq.indexOf(key);
    Object.keys(sections).forEach(function (k) { sections[k].hidden = k !== key; });
    $('progress-text').textContent = 'Schritt ' + (idx + 1) + ' von ' + seq.length + ': ' + TITEL[key];
    $('progress-bar').style.width = ((idx + 1) / seq.length * 100) + '%';
    if (key === 'kind') nachnameVorschlagen();
    if (key === 'pruefen') summary();
    if (initial) return;
    var h = sections[key].querySelector('h2');
    h.setAttribute('tabindex', '-1');
    window.scrollTo({ top: Math.max(0, form.getBoundingClientRect().top + window.pageYOffset - 20), behavior: 'smooth' });
    h.focus({ preventScroll: true });
  }
  function step(dir) {
    var seq = sequence(), i = seq.indexOf(current) + dir;
    if (i >= 0 && i < seq.length) go(seq[i]);
  }
  form.addEventListener('click', function (e) {
    if (e.target.matches('[data-next]')) { if (validate(current)) step(1); }
    else if (e.target.matches('[data-prev]')) { step(-1); }
    else if (e.target.matches('[data-goto]')) { go(e.target.getAttribute('data-goto')); }
  });
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.target.tagName === 'INPUT') && e.target.type !== 'submit') {
      e.preventDefault();
      if (current !== 'pruefen' && validate(current)) step(1);
    }
  });

  /* ---------- Absenden ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var seq = sequence();
    for (var i = 0; i < seq.length; i++) {
      if (seq[i] === 'pruefen') { if (!validate('pruefen')) return; continue; }
      if (!validate(seq[i])) { go(seq[i]); return; }
    }
    var btn = $('senden'), box = $('fehler-gesamt');
    box.hidden = true; btn.disabled = true; btn.textContent = 'Wird gesendet …';

    var data = new FormData(form);
    data.set('iban', cleanIban(val('iban')));
    data.set('kontoinhaber_gleich', $('gleich').checked ? 'ja' : 'nein');
    data.set('minderjaehrig', isMinor() ? 'ja' : 'nein');

    fetch('senden.php', { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (!(res && res.ok)) throw new Error((res && res.fehler) || '');
        form.hidden = true;
        $('erfolg-mandat').hidden = !bankNoetig();
        var done = $('erfolg'); done.hidden = false; done.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (err) {
        box.textContent = (err && err.message ? err.message + ' ' : 'Das Senden hat leider nicht geklappt. ') +
          'Deine Eingaben sind noch da. Bitte versuche es gleich noch einmal oder schreibe an vorstand@musikverein-grafenau.de.';
        box.hidden = false;
        btn.disabled = false; btn.textContent = 'Anmeldung absenden';
      });
  });

  go('anliegen', true);
})();
