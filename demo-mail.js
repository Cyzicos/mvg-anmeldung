/* ==========================================================
   NUR FÜR DIE DEMO (GitHub Pages): ersetzt senden.php.
   Baut dieselbe Mail wie senden.php. Ohne Server kann die Seite
   nicht selbst mailen (und soll keine Daten an Dritte geben),
   deshalb öffnet sich beim Absenden das eigene Mail-Programm
   mit der fertigen Mail.
   ========================================================== */
(function () {
  'use strict';

  var EMPFAENGER = 'jugend@musikverein-grafenau.de';   // zum Testen z. B. eine eigene Adresse eintragen
  var MIN_SEKUNDEN = 8;

  var originalFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (url !== 'senden.php') return originalFetch(url, opts);
    return senden(opts.body).then(function (res) {
      return new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json' } });
    });
  };

  function zwei(n) { return ('0' + n).slice(-2); }
  function datumDe(iso) { var p = (iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso; }
  function alter(iso) {
    var p = iso.split('-'), b = new Date(+p[0], +p[1] - 1, +p[2]), n = new Date();
    var a = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
    return a;
  }

  function senden(fd) {
    function t(k) { var v = fd.get(k); return typeof v === 'string' ? v.replace(/[\x00-\x1F\x7F]+/g, ' ').trim() : ''; }

    /* Spam-Schutz wie in senden.php */
    if (t('website') !== '') return Promise.resolve({ ok: true });
    var ts = parseInt(t('ts'), 10) || 0;
    if (ts <= 0 || (Date.now() - ts) / 1000 < MIN_SEKUNDEN) {
      return Promise.resolve({ ok: false, fehler: 'Das ging sehr schnell. Bitte prüfe deine Angaben und sende erneut.' });
    }

    var anliegen = t('anliegen'), kind = anliegen === 'kind';
    var status = kind ? t('mitglied_status') : '';
    var bestehend = kind && status === 'ja';
    var elternArt = (kind && !bestehend && t('eltern_aktiv') === 'ja') ? 'aktives' : 'förderndes';

    var vorname = t('vorname'), name = t('name'), gesch = t('geschlecht'), geb = t('geburtsdatum');
    var tel = t('telefon'), email = t('email'), strasse = t('strasse'), plz = t('plz'), ort = t('ort');
    var unter = t('unterschrift');
    var anmerk = (typeof fd.get('anmerkung') === 'string' ? fd.get('anmerkung') : '').replace(/\r\n?/g, '\n').trim();

    var minor = !bestehend && alter(geb) < 18;
    var vormund = t('erziehungsberechtigt');

    var bankNoetig = !bestehend || t('bank_geaendert') === 'ja';
    var iban = t('iban').replace(/\s+/g, '').toUpperCase();
    var bank = t('bank');
    var bic = iban.slice(0, 2) === 'DE' ? '' : t('bic').replace(/\s+/g, '').toUpperCase();
    var ki = t('kontoinhaber_gleich') === 'nein'
      ? t('ki_vorname') + ' ' + t('ki_name') + ', ' + t('ki_strasse') + ', ' + t('ki_plz') + ' ' + t('ki_ort')
      : vorname + ' ' + name + ', ' + strasse + ', ' + plz + ' ' + ort;

    /* Kinder: Felder heißen kinder[0][vorname] … */
    var roh = [];
    fd.forEach(function (v, k) {
      var m = /^kinder\[(\d+)\]\[(\w+)\]$/.exec(k);
      if (!m || typeof v !== 'string') return;
      (roh[+m[1]] = roh[+m[1]] || {})[m[2]] = v.trim();
    });
    var kinder = kind ? roh.filter(Boolean).slice(0, 6).map(function (k, i) {
      return {
        status: k.status || '', geschlecht: k.geschlecht || '', vor: k.vorname || '', nach: k.name || '',
        geb: k.geburtsdatum || '', bisher: k.bisher || '', kurs: k.kurs || '', instrument: k.instrument || '', miete: k.miete || '',
        ermaessigung: i > 0 ? 'ja (' + (i + 1) + '. Kind dieser Anmeldung)'
          : (k.ermaessigung === 'ja' ? 'ja (Geschwisterkind bereits in Ausbildung)' : 'nein')
      };
    }) : [];
    var kNamen = kinder.map(function (c) { return c.vor + ' ' + c.nach; }).join(', ');
    var mehrere = kinder.length > 1, anzahl = mehrere ? ' (' + kinder.length + ' Kinder)' : '';

    var bild = t('bildrechte');
    var medien = fd.getAll('medien[]').filter(function (m) { return typeof m === 'string'; });

    /* Kopfzeile je nach Fall */
    var fall, betreff;
    if (anliegen === 'aktiv') { fall = 'NEUES MITGLIED: aktiv'; betreff = 'Neues aktives Mitglied: ' + vorname + ' ' + name; }
    else if (anliegen === 'foerdernd') { fall = 'NEUES MITGLIED: fördernd'; betreff = 'Neues förderndes Mitglied: ' + vorname + ' ' + name; }
    else if (status === 'ja') {
      fall = 'KIND-ANMELDUNG' + anzahl + '. Elternteil ist bereits Mitglied (bitte über Name und Adresse zuordnen).';
      betreff = 'Kind-Anmeldung (' + kNamen + '), Elternteil bereits Mitglied: ' + vorname + ' ' + name;
    } else if (status === 'nein') {
      fall = 'KIND-ANMELDUNG' + anzahl + ' + NEUES ' + elternArt.toUpperCase() + ' MITGLIED (Elternteil). ' + (mehrere ? 'Die Kinder sind' : 'Das Kind ist') + ' automatisch Mitglied ohne Beitrag.';
      betreff = 'Kind-Anmeldung (' + kNamen + ') + neues ' + elternArt + ' Mitglied: ' + vorname + ' ' + name;
    } else {
      fall = 'KIND-ANMELDUNG' + anzahl + '. ACHTUNG: Antragsteller weiß nicht, ob ein Elternteil schon Mitglied ist. Bitte Mitgliedschaft prüfen. Elternteil wäre ' + elternArt.toUpperCase() + ' Mitglied.';
      betreff = 'Kind-Anmeldung (' + kNamen + '), Mitgliedschaft prüfen: ' + vorname + ' ' + name;
    }

    var pruefen = '';
    var schonDa = kinder.filter(function (c) { return c.status === 'bestehend'; });
    if (kind && !bestehend && schonDa.length) {
      pruefen = 'ACHTUNG, BITTE PRÜFEN: ' + schonDa.map(function (c) { return c.vor + ' ' + c.nach; }).join(', ')
        + (schonDa.length > 1 ? ' sind' : ' ist') + ' laut Angabe schon bei uns in Ausbildung, ein Elternteil aber '
        + (status === 'nein' ? 'angeblich kein Mitglied' : 'vielleicht kein Mitglied')
        + '. Eigentlich müsste ein Elternteil schon Mitglied sein (mögliche Doppelanmeldung).';
      betreff += ' [bitte prüfen]';
    }

    /* Mailtext (gleicher Aufbau wie senden.php) */
    var jetzt = new Date(), heute = zwei(jetzt.getDate()) + '.' + zwei(jetzt.getMonth() + 1) + '.' + jetzt.getFullYear();
    var z = [];
    z.push('ONLINE-ANMELDUNG', fall);
    if (pruefen) z.push(pruefen);
    z.push('Eingegangen: ' + heute + ' ' + zwei(jetzt.getHours()) + ':' + zwei(jetzt.getMinutes()) + ' Uhr');
    z.push(new Array(49).join('-'));
    z.push(bestehend ? 'BESTEHENDES MITGLIED (Zuordnung über Name und Adresse)' : 'ANTRAGSTELLER' + (kind ? ' (Elternteil)' : ''));
    z.push('Name: ' + vorname + ' ' + name);
    if (!bestehend) {
      z.push('Geschlecht: ' + gesch);
      z.push('Geburtsdatum: ' + datumDe(geb) + (minor ? ' (minderjährig)' : ''));
      if (minor) z.push('Erziehungsberechtigte(r): ' + vormund);
    }
    z.push('Anschrift: ' + strasse + ', ' + plz + ' ' + ort);
    z.push('Telefon: ' + (tel || '–'));
    z.push('E-Mail: ' + email);

    kinder.forEach(function (c, i) {
      z.push('');
      z.push('KIND' + (mehrere ? ' ' + (i + 1) : '') + ' (' + (c.status === 'neu' ? 'neu im Verein' : 'bereits in Ausbildung bei uns') + ')');
      z.push('Name: ' + c.vor + ' ' + c.nach);
      if (c.status === 'neu') z.push('Geschlecht: ' + c.geschlecht);
      z.push('Geburtsdatum: ' + datumDe(c.geb));
      if (c.status === 'bestehend' && c.bisher) z.push('Bisherige Ausbildung: ' + c.bisher);
      z.push((c.status === 'bestehend' ? 'Neue Ausbildung: ' : 'Ausbildung: ') + c.kurs);
      if (c.kurs === 'Instrumentalausbildung') { z.push('Instrument: ' + c.instrument); z.push('Instrument mieten: ' + c.miete); }
      z.push('Ermäßigung Ausbildungsbeitrag: ' + c.ermaessigung);
    });

    z.push('');
    if (bankNoetig) {
      z.push('SEPA-LASTSCHRIFTMANDAT (erteilt)' + (bestehend ? ' – NEUE Bankverbindung' : ''));
      z.push('Kontoinhaber: ' + ki);
      z.push('Kreditinstitut: ' + bank);
      z.push('IBAN: ' + iban.replace(/(.{4})/g, '$1 ').trim());
      if (bic) z.push('BIC: ' + bic);
      z.push('Gläubiger-ID: DE47ZZZ00000107569 (Mandatsreferenz bitte separat mitteilen)');
    } else {
      z.push('BANKVERBINDUNG: unverändert, bestehendes Mandat gilt.');
    }

    z.push('', 'EINWILLIGUNGEN');
    if (!bestehend) z.push('Satzung anerkannt: ja', 'Datenschutz zur Kenntnis genommen: ja');
    z.push((kind ? (mehrere ? 'Fotos/Videos (Elternteil und Kinder): ' : 'Fotos/Videos (Elternteil und Kind): ') : 'Fotos/Videos: ')
      + (bild === 'ja' ? 'ja, auf: ' + (medien.length ? medien.join(', ') : '–') : 'NEIN'));
    if (anmerk) z.push('', 'ANMERKUNG:', anmerk);

    z.push('', 'Bestätigt durch: ' + unter + ' am ' + heute);
    z.push('Hinweis: Online-Bestätigung per Namenseingabe und Checkbox.');
    var text = z.join('\n') + '\n';

    window.DEMO_LETZTE_MAIL = { betreff: betreff, text: text };   // zum Prüfen in der Browser-Konsole
    var link = 'mailto:' + EMPFAENGER + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text.replace(/\n/g, '\r\n'));
    erfolgsseite(link, text);
    window.location.href = link;          // öffnet das Mail-Programm mit der fertigen Mail
    return Promise.resolve({ ok: true }); // danach zeigt app.js die Erfolgsseite
  }

  /* Erfolgsseite: Der Antrag ist erst angekommen, wenn die Mail abgeschickt wurde */
  function erfolgsseite(link, text) {
    var erfolg = document.getElementById('erfolg');
    erfolg.querySelector('h2').textContent = 'Fast fertig. Antrag an deinen Musikverein Grafenau schicken';
    erfolg.querySelector('p').textContent = 'Dein Mail-Programm hat sich mit dem fertigen Antrag geöffnet. Bitte schick die Mail jetzt ab. Erst dann ist dein Antrag beim Vorstand.';

    var alt = document.getElementById('mail-knoepfe'); if (alt) alt.remove();
    var box = document.createElement('div'); box.id = 'mail-knoepfe';
    var knoepfe = document.createElement('p'); knoepfe.className = 'done__actions';
    var a = document.createElement('a'); a.className = 'btn'; a.href = link; a.textContent = 'Mail-Programm erneut öffnen';
    var kopie = document.createElement('button'); kopie.type = 'button'; kopie.className = 'btn btn--ghost'; kopie.textContent = 'Antrag als Text kopieren';
    kopie.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { kopie.textContent = 'Kopiert'; }, function () {});
    });
    knoepfe.appendChild(a); knoepfe.appendChild(kopie);
    var hinweis = document.createElement('p'); hinweis.className = 'hint';
    hinweis.appendChild(document.createTextNode('Es hat sich kein Mail-Programm geöffnet, oder der Text ist abgeschnitten? Dann kopiere den Antrag und schick ihn per Mail an '));
    var mail = document.createElement('a'); mail.href = 'mailto:' + EMPFAENGER; mail.textContent = EMPFAENGER;
    hinweis.appendChild(mail); hinweis.appendChild(document.createTextNode('.'));
    box.appendChild(knoepfe); box.appendChild(hinweis);
    erfolg.insertBefore(box, erfolg.querySelector('#erfolg-mandat'));
    var zurueck = erfolg.querySelector('.done__actions a.btn'); if (zurueck) zurueck.classList.add('btn--ghost');   // Hauptaktion ist das Abschicken
  }
})();
