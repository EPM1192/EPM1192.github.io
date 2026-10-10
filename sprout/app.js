(function () {
  "use strict";

  /**
   * 公開前に埋める設定。空文字の項目は画面で「準備中 / TODO」と出す。
   * 外部の計測タグは置かない。
   */
  var SPROUT_CONFIG = {
    APP_STORE_URL: "https://apps.apple.com/jp/app/id6792189779",
    PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=com.isfactory.englishapp",
    // 公開サイト（GitHub Pages）。この観察ページは /sprout/ に置く。
    WEB_APP_URL: "https://epm1192.github.io/"
  };

  var STORAGE_KEY = "raburin-sprout-log-v1";
  var FULL_FIELDS = ["title", "motive", "hypothesis", "materials", "method", "summary", "discussion", "impression"];
  var METHOD_TEMPLATE = [
    "1. 種をコップの水に、ひと晩（8〜12時間）つけた。",
    "2. 水を捨てて、種を穴あきカップに広げた。",
    "3. 暗くてあたたかい場所（20〜25℃）に置いた。",
    "4. 1日2回、流しの上でカップに水をさっとかけて、よく水を切った。",
    "5. 芽が2〜3cmになったら、明るい窓辺に移した。",
    "6. 毎日、ものさしで長さをはかり、色を見て、写真を撮った。"
  ].join("\n");

  var startInput;
  var nameInput;
  var gradeInput;
  var reflectionInput;
  var statusEl;
  var saveTimer = 0;
  var fullMode = false;

  function todayISO() {
    var now = new Date();
    return formatDate(now);
  }

  function formatDate(date) {
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());
    if (month.length < 2) month = "0" + month;
    if (day.length < 2) day = "0" + day;
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function parseISODate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return null;
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function addDays(iso, days) {
    var date = parseISODate(iso);
    if (!date) return "";
    date.setDate(date.getDate() + days);
    return formatDate(date);
  }

  function daysBetween(startIso, endIso) {
    var start = parseISODate(startIso);
    var end = parseISODate(endIso);
    if (!start || !end) return null;
    var ms = end.getTime() - start.getTime();
    return Math.round(ms / 86400000);
  }

  function safeHttpUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    try {
      var url = new URL(raw, window.location.origin);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function emptyFullReport() {
    return {
      title: "",
      motive: "",
      hypothesis: "",
      materials: "",
      method: "",
      summary: "",
      discussion: "",
      impression: ""
    };
  }

  function normalizeFullReport(value) {
    var blank = emptyFullReport();
    if (!value || typeof value !== "object") return blank;
    FULL_FIELDS.forEach(function (name) {
      blank[name] = typeof value[name] === "string" ? value[name] : "";
    });
    return blank;
  }

  function emptyState() {
    return {
      version: 1,
      startDate: "",
      name: "",
      grade: "",
      reflection: "",
      days: {},
      fullReport: emptyFullReport(),
      fullMode: false
    };
  }

  function readState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return emptyState();
      data.days = data.days || {};
      data.fullReport = normalizeFullReport(data.fullReport);
      data.fullMode = data.fullMode === true;
      return data;
    } catch (error) {
      return emptyState();
    }
  }

  function fullInput(name) {
    return document.getElementById("full-" + name);
  }

  function readFullReport() {
    var data = emptyFullReport();
    FULL_FIELDS.forEach(function (name) {
      var el = fullInput(name);
      data[name] = el ? el.value : "";
    });
    return data;
  }

  function writeFullReport(data) {
    var source = normalizeFullReport(data);
    FULL_FIELDS.forEach(function (name) {
      var el = fullInput(name);
      if (el) el.value = source[name];
    });
  }

  function hasFullReportText(data) {
    var source = data || {};
    return FULL_FIELDS.some(function (name) {
      return !!source[name];
    });
  }

  function collectState() {
    var state = emptyState();
    state.startDate = startInput.value || "";
    state.name = nameInput.value || "";
    state.grade = gradeInput.value || "";
    state.reflection = reflectionInput.value || "";
    state.fullReport = readFullReport();
    state.fullMode = fullMode;
    document.querySelectorAll(".day").forEach(function (day) {
      var key = day.getAttribute("data-day");
      var photo = day.querySelector(".photo-preview");
      state.days[key] = {
        date: valueOf(day, "date"),
        length: valueOf(day, "length"),
        color: valueOf(day, "color"),
        memo: valueOf(day, "memo"),
        photo: photo && isSafePhoto(photo.getAttribute("src")) ? photo.getAttribute("src") : ""
      };
    });
    return state;
  }

  function valueOf(day, field) {
    var el = day.querySelector('[data-field="' + field + '"]');
    return el ? el.value : "";
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function writeState(state) {
    var json = JSON.stringify(state);
    if (json.length > 4500000) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
      return true;
    } catch (error) {
      return false;
    }
  }

  function dropLargestPhoto(state) {
    var biggestKey = "";
    var biggestSize = 0;
    Object.keys(state.days || {}).forEach(function (key) {
      var photo = state.days[key] && state.days[key].photo ? state.days[key].photo : "";
      if (photo.length > biggestSize) {
        biggestSize = photo.length;
        biggestKey = key;
      }
    });
    if (!biggestKey) return false;
    state.days[biggestKey].photo = "";
    return true;
  }

  function saveNow() {
    var state = collectState();
    var dropped = false;
    var guard = 0;
    var ok = writeState(state);
    while (!ok && guard < 8 && dropLargestPhoto(state)) {
      dropped = true;
      guard += 1;
      ok = writeState(state);
    }
    if (!ok) {
      setStatus("この端末の保存場所がいっぱいで、メモを残せなかったよ。写真を消して、もう一度ためしてね。");
      renderReport();
      return;
    }
    if (dropped) {
      document.querySelectorAll(".day").forEach(function (day) {
        var saved = state.days[day.getAttribute("data-day")] || {};
        if (!saved.photo) showPhoto(day, "");
      });
      setStatus("保存場所がいっぱいだったので、大きい写真は外したよ。文字のメモは残してあるよ。");
    } else {
      setStatus("この端末に保存したよ");
    }
    renderReport();
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 250);
  }

  function buildDays() {
    var host = document.getElementById("days");
    var template = document.getElementById("day-template");
    for (var n = 1; n <= 7; n += 1) {
      var node = template.content.firstElementChild.cloneNode(true);
      node.setAttribute("data-day", String(n));
      node.querySelector(".day-num").textContent = String(n);
      node.querySelector(".day-ja").textContent = n + "日目";
      node.querySelector(".day-en").textContent = "Day " + n;
      var photo = node.querySelector(".photo-preview");
      photo.alt = n + "日目の写真";
      ["date", "length", "color", "memo", "photo"].forEach(function (field) {
        var input = node.querySelector('[data-field="' + field + '"]');
        var id = "day-" + n + "-" + field;
        input.id = id;
        var label = input.closest("label");
        if (label) label.setAttribute("for", id);
      });
      host.appendChild(node);
    }
  }

  function applyStartDates(overwrite) {
    var start = startInput.value;
    document.querySelectorAll(".day").forEach(function (day) {
      var input = day.querySelector('[data-field="date"]');
      var dayNumber = Number(day.getAttribute("data-day"));
      if (!overwrite && input.value) return;
      input.value = start ? addDays(start, dayNumber - 1) : "";
    });
  }

  function activeDayNumber() {
    if (!startInput.value) return 0;
    var diff = daysBetween(startInput.value, todayISO());
    if (diff === null || diff < 0 || diff > 6) return 0;
    return diff + 1;
  }

  function updateHighlight() {
    var active = activeDayNumber();
    var start = startInput.value;
    var diff = start ? daysBetween(start, todayISO()) : null;

    document.querySelectorAll(".day").forEach(function (day) {
      var on = Number(day.getAttribute("data-day")) === active;
      day.classList.toggle("is-today", on);
      var flag = day.querySelector(".today-flag");
      if (flag) flag.hidden = !on;
    });

    document.querySelectorAll(".phrase").forEach(function (item) {
      var on = Number(item.getAttribute("data-day")) === active;
      item.classList.toggle("is-today", on);
      if (on) item.setAttribute("aria-current", "date");
      else item.removeAttribute("aria-current");
    });

    var phrase = active ? document.querySelector('.phrase[data-day="' + active + '"]') : null;
    var en = document.getElementById("dragon-en");
    var ja = document.getElementById("dragon-ja");
    var live = document.getElementById("today-phrase");
    if (!start) {
      en.textContent = "Let's grow!";
      ja.textContent = "始めた日を入れると、今日のフレーズが光るよ";
      live.textContent = "";
      return;
    }
    if (phrase) {
      en.textContent = phrase.querySelector(".phrase-en").textContent;
      ja.textContent = phrase.querySelector(".phrase-ja").textContent;
      live.textContent = "今日は " + active + "日目。" + en.textContent + " " + ja.textContent;
      return;
    }
    if (diff !== null && diff > 6) {
      en.textContent = "You did it!";
      ja.textContent = "7日間、おつかれさま！";
      live.textContent = "7日間が終わったよ。おつかれさま！";
      return;
    }
    en.textContent = "See you soon!";
    ja.textContent = "始めの日まで、待ってるね";
    live.textContent = "まだ1日目の前だよ。";
  }

  function isSafePhoto(value) {
    return typeof value === "string" && value.indexOf("data:image/") === 0 && value.length < 500000;
  }

  function showPhoto(day, dataUrl) {
    var img = day.querySelector(".photo-preview");
    var remove = day.querySelector(".photo-remove");
    if (!isSafePhoto(dataUrl)) {
      img.removeAttribute("src");
      img.hidden = true;
      remove.hidden = true;
      return;
    }
    img.src = dataUrl;
    img.hidden = false;
    remove.hidden = false;
  }

  function restore(state) {
    startInput.value = state.startDate || "";
    nameInput.value = state.name || "";
    gradeInput.value = state.grade || "";
    reflectionInput.value = state.reflection || "";
    writeFullReport(state.fullReport);
    document.querySelectorAll(".day").forEach(function (day) {
      var saved = state.days[day.getAttribute("data-day")] || {};
      day.querySelector('[data-field="date"]').value = saved.date || "";
      day.querySelector('[data-field="length"]').value = saved.length || "";
      day.querySelector('[data-field="color"]').value = saved.color || "";
      day.querySelector('[data-field="memo"]').value = saved.memo || "";
      showPhoto(day, saved.photo || "");
    });
    applyStartDates(false);
    updateHighlight();
    updateDiscussionHint();
    document.body.classList.add("is-instant");
    applyFullMode(state.fullMode === true);
    document.body.classList.remove("is-instant");
    renderReport();
    if (state.fullMode || state.startDate || state.name || state.grade || state.reflection || hasFullReportText(state.fullReport) || Object.keys(state.days).length) {
      setStatus("この端末に保存してあるメモを開いたよ");
    }
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var maxSide = 360;
        var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.62));
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      image.src = url;
    });
  }

  function clearLog() {
    var ok = window.confirm("この端末に保存した観察メモを消します。写真も消えます。自由研究レポートに書いた文章は残します。");
    if (!ok) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      setStatus("消せなかったよ。ブラウザの設定を確認してね。");
      return;
    }
    startInput.value = "";
    nameInput.value = "";
    gradeInput.value = "";
    reflectionInput.value = "";
    document.querySelectorAll(".day").forEach(function (day) {
      day.querySelectorAll("input, textarea, select").forEach(function (input) {
        if (input.type === "file") input.value = "";
        else input.value = "";
      });
      showPhoto(day, "");
    });
    updateHighlight();
    updateDiscussionHint();
    saveNow();
    setStatus("観察メモを消したよ。自由研究の文章は残してあるよ。");
  }

  function displayDate(iso) {
    var date = parseISODate(iso);
    if (!date) return "";
    return (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function lengthNumber(value) {
    if (value === "" || value == null) return null;
    var number = Number(value);
    if (!isFinite(number) || number < 0) return null;
    return number;
  }

  function collectLengths() {
    var lengths = [];
    document.querySelectorAll(".day").forEach(function (day) {
      lengths.push(lengthNumber(valueOf(day, "length")));
    });
    return lengths;
  }

  function renderChartInto(host, lengths) {
    host.replaceChildren();
    var width = 640;
    var height = 168;
    var padL = 36;
    var padR = 12;
    var padT = 16;
    var padB = 28;
    var max = 1;
    lengths.forEach(function (value) {
      if (value != null && value > max) max = value;
    });
    max = Math.max(1, Math.ceil(max));
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "芽の長さのグラフ";
    svg.appendChild(title);
    function xAt(index) {
      return padL + (index * (width - padL - padR)) / 6;
    }
    function yAt(value) {
      return padT + (1 - value / max) * (height - padT - padB);
    }
    var axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
    axis.setAttribute("d", "M" + padL + " " + padT + " V" + (height - padB) + " H" + (width - padR));
    axis.setAttribute("fill", "none");
    axis.setAttribute("stroke", "#5c516e");
    axis.setAttribute("stroke-width", "2");
    svg.appendChild(axis);
    var labelTop = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelTop.setAttribute("x", "4");
    labelTop.setAttribute("y", padT + 4);
    labelTop.setAttribute("fill", "#5c516e");
    labelTop.setAttribute("font-size", "12");
    labelTop.textContent = max + "cm";
    svg.appendChild(labelTop);
    var points = [];
    lengths.forEach(function (value, index) {
      var x = xAt(index);
      var base = height - padB;
      var tick = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tick.setAttribute("x", String(x));
      tick.setAttribute("y", String(height - 8));
      tick.setAttribute("text-anchor", "middle");
      tick.setAttribute("fill", "#5c516e");
      tick.setAttribute("font-size", "12");
      tick.textContent = String(index + 1);
      svg.appendChild(tick);
      if (value == null) return;
      var y = yAt(value);
      points.push(x + "," + y);
      var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "5");
      dot.setAttribute("fill", "#b31866");
      svg.appendChild(dot);
      var stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
      stem.setAttribute("x1", String(x));
      stem.setAttribute("x2", String(x));
      stem.setAttribute("y1", String(base));
      stem.setAttribute("y2", String(y));
      stem.setAttribute("stroke", "#7dce55");
      stem.setAttribute("stroke-width", "3");
      svg.insertBefore(stem, dot);
    });
    if (points.length >= 2) {
      var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", points.join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#1f7a34");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("stroke-linecap", "round");
      svg.insertBefore(line, svg.querySelector("circle"));
    }
    if (!points.length) {
      var empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
      empty.setAttribute("x", String(width / 2));
      empty.setAttribute("y", String(height / 2));
      empty.setAttribute("text-anchor", "middle");
      empty.setAttribute("fill", "#5c516e");
      empty.setAttribute("font-size", "14");
      empty.textContent = "長さを書くと、グラフになるよ";
      svg.appendChild(empty);
    }
    var caption = document.createElement("p");
    caption.className = "chart-caption";
    caption.textContent = "長さのうつりかわり（cm）";
    host.appendChild(caption);
    host.appendChild(svg);
  }

  function renderReport() {
    var lengths = collectLengths();
    renderChartInto(document.getElementById("screen-chart"), lengths);
    renderChartInto(document.getElementById("report-chart"), lengths);
    var name = nameInput.value.trim();
    var grade = gradeInput.value.trim();
    var start = displayDate(startInput.value);
    var meta = document.getElementById("report-meta");
    meta.replaceChildren();
    [
      "なまえ：" + (name || "＿＿＿＿"),
      "学年・組：" + (grade || "＿＿＿＿"),
      "始めた日：" + (start || "＿月＿日")
    ].forEach(function (line) {
      var span = document.createElement("span");
      span.textContent = line;
      meta.appendChild(span);
    });
    var daysHost = document.getElementById("report-days");
    daysHost.replaceChildren();
    document.querySelectorAll(".day").forEach(function (day) {
      var number = day.getAttribute("data-day");
      var card = document.createElement("article");
      card.className = "report-day";
      card.setAttribute("data-day", number);
      var heading = document.createElement("h3");
      var dateText = displayDate(valueOf(day, "date"));
      heading.textContent = number + "日目" + (dateText ? "  " + dateText : "");
      card.appendChild(heading);
      var photo = day.querySelector(".photo-preview");
      var src = photo ? photo.getAttribute("src") : "";
      if (isSafePhoto(src)) {
        var img = document.createElement("img");
        img.src = src;
        img.alt = number + "日目の写真";
        card.appendChild(img);
      } else {
        var emptyPhoto = document.createElement("p");
        emptyPhoto.className = "report-nophoto";
        emptyPhoto.textContent = "写真なし";
        card.appendChild(emptyPhoto);
      }
      var facts = document.createElement("p");
      var length = valueOf(day, "length");
      var color = valueOf(day, "color");
      facts.textContent = "長さ " + (length || "＿") + " cm　色 " + (color || "＿");
      card.appendChild(facts);
      var memo = document.createElement("p");
      memo.className = "report-memo";
      memo.textContent = valueOf(day, "memo") || " ";
      card.appendChild(memo);
      daysHost.appendChild(card);
    });
    var reflect = document.getElementById("report-reflect-text");
    var text = reflectionInput.value.trim();
    reflect.textContent = text || "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿";
    reflect.classList.toggle("is-empty", !text);
    if (document.getElementById("full-print-body")) renderFullReport();
  }

  function periodLabel() {
    var start = startInput.value;
    if (!start) return "＿月＿日〜＿月＿日";
    return displayDate(start) + "〜" + displayDate(addDays(start, 6));
  }

  function updateDiscussionHint() {
    var hint = document.getElementById("full-discussion-hint");
    if (!hint || !reflectionInput) return;
    var existing = reflectionInput.value.trim();
    if (!existing) {
      hint.textContent = "れい：予想では10cmになると思ったけど、7日目は8cmだった。色は予想どおり緑になった。観察シートの「わかったこと・かんそう」とは別に書こう。";
      return;
    }
    var clip = existing.length > 42 ? existing.slice(0, 42) + "…" : existing;
    hint.textContent = "観察シートの「わかったこと・かんそう」とは別のらん。予想とくらべて書こう。シートには「" + clip + "」と書いてあるよ。";
  }

  function lineBox(text, linesClass) {
    var box = document.createElement("div");
    var value = text ? String(text).trim() : "";
    box.className = "full-lines " + (value ? "has-text" : "is-blank " + linesClass);
    if (value) {
      box.textContent = value;
      return box;
    }
    var counts = { "lines-1": 1, "lines-2": 2, "lines-4": 4, "lines-5": 5, "lines-6": 6 };
    var count = counts[linesClass] || 4;
    for (var i = 0; i < count; i += 1) {
      var rule = document.createElement("div");
      rule.className = "full-rule";
      box.appendChild(rule);
    }
    return box;
  }

  function sectionBlock(heading, node) {
    var section = document.createElement("section");
    section.className = "full-sec";
    var keep = document.createElement("div");
    keep.className = "full-keep";
    var h3 = document.createElement("h3");
    h3.textContent = heading;
    keep.appendChild(h3);
    keep.appendChild(node);
    section.appendChild(keep);
    return section;
  }

  function subKeep(label, node) {
    var wrap = document.createElement("div");
    wrap.className = "full-keep";
    var h4 = document.createElement("h4");
    h4.textContent = label;
    wrap.appendChild(h4);
    wrap.appendChild(node);
    return wrap;
  }

  function buildFullTable() {
    var table = document.createElement("table");
    table.className = "full-table";
    table.setAttribute("aria-label", "7日間の観察記録");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    ["日", "日付", "長さ", "色", "メモ"].forEach(function (label) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    document.querySelectorAll("#days .day").forEach(function (day) {
      var number = day.getAttribute("data-day");
      var length = valueOf(day, "length");
      var cells = [
        number + "日目",
        displayDate(valueOf(day, "date")),
        length ? length + " cm" : "",
        valueOf(day, "color"),
        valueOf(day, "memo")
      ];
      var tr = document.createElement("tr");
      cells.forEach(function (cellText) {
        var td = document.createElement("td");
        td.textContent = cellText || "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function buildFullPhotos() {
    var grid = document.createElement("div");
    grid.className = "full-photos";
    document.querySelectorAll("#days .day").forEach(function (day) {
      var number = day.getAttribute("data-day");
      var fig = document.createElement("figure");
      fig.className = "full-photo";
      var photo = day.querySelector(".photo-preview");
      var src = photo ? photo.getAttribute("src") : "";
      if (isSafePhoto(src)) {
        var img = document.createElement("img");
        img.src = src;
        img.alt = number + "日目の写真";
        fig.appendChild(img);
      } else {
        var empty = document.createElement("div");
        empty.className = "full-photo-empty";
        empty.textContent = "写真";
        fig.appendChild(empty);
      }
      var cap = document.createElement("figcaption");
      cap.textContent = number + "日目";
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
    return grid;
  }

  function methodSection(materials, method) {
    var section = document.createElement("section");
    section.className = "full-sec";
    var first = document.createElement("div");
    first.className = "full-keep";
    var h3 = document.createElement("h3");
    h3.textContent = "③ 研究の方法";
    var h4 = document.createElement("h4");
    h4.textContent = "用意したもの";
    first.appendChild(h3);
    first.appendChild(h4);
    first.appendChild(lineBox(materials, "lines-2"));
    section.appendChild(first);
    section.appendChild(subKeep("やり方", lineBox(method, "lines-6")));
    return section;
  }

  function resultsSection(summary) {
    var section = document.createElement("section");
    section.className = "full-sec";
    var tableWrap = document.createElement("div");
    tableWrap.className = "full-keep-loose";
    var h3 = document.createElement("h3");
    h3.textContent = "④ 結果";
    var h4 = document.createElement("h4");
    h4.textContent = "7日間の記録";
    tableWrap.appendChild(h3);
    tableWrap.appendChild(h4);
    tableWrap.appendChild(buildFullTable());
    section.appendChild(tableWrap);
    section.appendChild(subKeep("写真", buildFullPhotos()));
    var chart = document.createElement("div");
    chart.className = "full-print-chart";
    section.appendChild(subKeep("長さのグラフ", chart));
    renderChartInto(chart, collectLengths());
    section.appendChild(subKeep("結果のまとめ", lineBox(summary, "lines-4")));
    return section;
  }

  function renderFullHeader(full) {
    var slot = document.getElementById("full-print-title-slot");
    if (!slot) return;
    slot.replaceChildren();
    var title = (full.title || "").trim();
    if (title) {
      var h2 = document.createElement("h2");
      h2.className = "report-title";
      h2.textContent = title;
      slot.appendChild(h2);
    } else {
      var label = document.createElement("p");
      label.className = "full-title-label";
      label.textContent = "研究のタイトル";
      slot.appendChild(label);
      slot.appendChild(lineBox("", "lines-1"));
    }
    var meta = document.getElementById("full-print-meta");
    meta.replaceChildren();
    var name = nameInput.value.trim();
    var grade = gradeInput.value.trim();
    [
      "なまえ：" + (name || "＿＿＿＿"),
      "学年・組：" + (grade || "＿＿＿＿"),
      "期間：" + periodLabel()
    ].forEach(function (line) {
      var span = document.createElement("span");
      span.textContent = line;
      meta.appendChild(span);
    });
  }

  function renderFullReport() {
    var full = readFullReport();
    renderFullHeader(full);
    var body = document.getElementById("full-print-body");
    if (!body) return;
    body.replaceChildren(
      sectionBlock("① 調べようと思ったきっかけ", lineBox(full.motive, "lines-5")),
      sectionBlock("② 予想（どうなると思ったか）", lineBox(full.hypothesis, "lines-5")),
      methodSection(full.materials, full.method),
      resultsSection(full.summary),
      sectionBlock("⑤ 考察（わかったこと・予想とくらべて）", lineBox(full.discussion, "lines-5")),
      sectionBlock("⑥ 感想・これから調べたいこと", lineBox(full.impression, "lines-5"))
    );
  }

  function applyFullMode(open) {
    fullMode = !!open;
    document.body.classList.toggle("is-full-report", fullMode);
    document.querySelectorAll(".full-only").forEach(function (panel) {
      if (fullMode) {
        panel.removeAttribute("inert");
        panel.setAttribute("aria-hidden", "false");
      } else {
        panel.setAttribute("inert", "");
        panel.setAttribute("aria-hidden", "true");
      }
    });
    var toggleLabel = fullMode ? "かんたん版にもどす" : "自由研究レポート（本格版）にする";
    var printLabel = fullMode ? "本格版レポートを印刷" : "かんたんレポートを印刷";
    document.querySelectorAll("[data-full-toggle]").forEach(function (button) {
      button.setAttribute("aria-expanded", fullMode ? "true" : "false");
      button.textContent = toggleLabel;
    });
    document.querySelectorAll("[data-print-mode]").forEach(function (button) {
      button.textContent = printLabel;
    });
  }

  function insertMethod() {
    var el = fullInput("method");
    if (!el) return;
    var current = el.value.trim();
    if (current && current.indexOf(METHOD_TEMPLATE) !== -1) {
      setStatus("キットの育て方は、もう入っているよ");
      return;
    }
    el.value = current ? el.value.replace(/\s+$/, "") + "\n" + METHOD_TEMPLATE : METHOD_TEMPLATE;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }

  function beginPrint(mode) {
    saveNow();
    renderReport();
    if (mode === "full") renderFullReport();
    document.body.setAttribute("data-print", mode);
    window.print();
  }

  function todoNote(message) {
    var p = document.createElement("p");
    p.className = "todo-note";
    var badge = document.createElement("span");
    badge.className = "todo-badge";
    badge.textContent = "TODO";
    p.appendChild(badge);
    p.appendChild(document.createTextNode(message));
    return p;
  }

  function renderAppLinks() {
    var slot = document.getElementById("app-links");
    slot.replaceChildren();
    var webHref = safeHttpUrl(SPROUT_CONFIG.WEB_APP_URL);
    if (webHref) {
      var web = document.createElement("a");
      web.className = "btn btn-primary";
      web.href = webHref;
      web.textContent = "らぶりん英会話のサイトを開く";
      web.target = "_blank";
      web.rel = "noopener noreferrer";
      slot.appendChild(web);
    }
    [
      ["App Store", SPROUT_CONFIG.APP_STORE_URL, "APP_STORE_URL"],
      ["Google Play", SPROUT_CONFIG.PLAY_STORE_URL, "PLAY_STORE_URL"]
    ].forEach(function (item) {
      var href = safeHttpUrl(item[1]);
      if (href) {
        var link = document.createElement("a");
        link.className = "btn btn-ghost";
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item[0];
        slot.appendChild(link);
        return;
      }
      var span = document.createElement("span");
      span.className = "store-link is-todo";
      span.textContent = item[0] + "（準備中）";
      span.title = "TODO: " + item[2];
      slot.appendChild(span);
    });
    if (!safeHttpUrl(SPROUT_CONFIG.APP_STORE_URL) || !safeHttpUrl(SPROUT_CONFIG.PLAY_STORE_URL)) {
      var note = todoNote("ストアのURLは未設定です（app.js の APP_STORE_URL / PLAY_STORE_URL）");
      note.style.flexBasis = "100%";
      slot.appendChild(note);
    }
  }

  function speak(text) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function onDayEvent(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var field = target.getAttribute("data-field");
    if (!field) return;
    var day = target.closest(".day");
    if (field === "photo") {
      var file = target.files && target.files[0];
      target.value = "";
      if (!file) return;
      if (!file.type || file.type.indexOf("image/") !== 0) {
        setStatus("写真のファイルを選んでね");
        return;
      }
      compressImage(file).then(function (dataUrl) {
        showPhoto(day, dataUrl);
        saveNow();
      }).catch(function () {
        setStatus("この写真は読み込めなかったよ。別の写真にしてね。");
      });
      return;
    }
    scheduleSave();
  }

  function init() {
    startInput = document.getElementById("start-date");
    nameInput = document.getElementById("observer-name");
    gradeInput = document.getElementById("observer-grade");
    reflectionInput = document.getElementById("reflection");
    statusEl = document.getElementById("save-status");
    buildDays();
    renderAppLinks();

    if (!window.speechSynthesis) {
      document.querySelectorAll(".speak").forEach(function (button) {
        button.hidden = true;
      });
    }

    document.getElementById("sheet-form").addEventListener("submit", function (event) {
      event.preventDefault();
      saveNow();
    });

    startInput.addEventListener("change", function () {
      applyStartDates(true);
      updateHighlight();
      scheduleSave();
    });

    nameInput.addEventListener("input", scheduleSave);
    gradeInput.addEventListener("input", scheduleSave);
    reflectionInput.addEventListener("input", function () {
      updateDiscussionHint();
      scheduleSave();
    });

    document.getElementById("start-today").addEventListener("click", function () {
      var today = todayISO();
      if (startInput.value && startInput.value !== today) {
        var ok = window.confirm("始めた日を今日に変えると、1〜7日目の日付も今日から付け直します。メモや写真はそのままです。");
        if (!ok) return;
      }
      startInput.value = today;
      applyStartDates(true);
      updateHighlight();
      saveNow();
    });

    var days = document.getElementById("days");
    days.addEventListener("input", onDayEvent);
    days.addEventListener("change", onDayEvent);
    days.addEventListener("click", function (event) {
      var button = event.target.closest(".photo-remove");
      if (!button) return;
      var day = button.closest(".day");
      showPhoto(day, "");
      saveNow();
    });

    document.querySelectorAll("[data-print-trigger]").forEach(function (button) {
      button.addEventListener("click", function () {
        beginPrint(button.getAttribute("data-print-trigger"));
      });
    });
    document.querySelectorAll("[data-print-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        beginPrint(fullMode ? "full" : "report");
      });
    });
    document.querySelectorAll("[data-full-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = !fullMode;
        if (!next) {
          var active = document.activeElement;
          var inside = false;
          document.querySelectorAll(".full-only").forEach(function (panel) {
            if (active && panel.contains(active)) inside = true;
          });
          if (inside) button.focus();
        }
        applyFullMode(next);
        saveNow();
      });
    });
    document.getElementById("sheet-form").addEventListener("input", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest(".full-only")) scheduleSave();
    });
    document.getElementById("insert-method").addEventListener("click", insertMethod);
    window.addEventListener("beforeprint", function () {
      if (!document.body.getAttribute("data-print")) {
        document.body.setAttribute("data-print", "blank");
        document.body.setAttribute("data-print-auto", "1");
      }
      renderReport();
    });
    window.addEventListener("afterprint", function () {
      document.body.removeAttribute("data-print");
      document.body.removeAttribute("data-print-auto");
    });

    document.getElementById("clear-log").addEventListener("click", clearLog);

    document.querySelectorAll(".speak").forEach(function (button) {
      button.addEventListener("click", function () {
        speak(button.getAttribute("data-speak") || "");
      });
    });

    window.addEventListener("pagehide", function () {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    });

    restore(readState());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
