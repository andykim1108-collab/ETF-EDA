const MANAGERS = {
  KODEX: '삼성자산운용', TIGER: '미래에셋자산운용', RISE: 'KB자산운용',
  ACE: '한국투자신탁운용', PLUS: '한화자산운용', SOL: '신한자산운용',
  KIWOOM: '키움투자자산운용', HANARO: 'NH-Amundi자산운용', '1Q': '하나자산운용',
  KoAct: '삼성액티브자산운용', TIME: '타임폴리오자산운용', WON: '우리자산운용',
  '에셋플러스': '에셋플러스자산운용', '마이티': 'DB자산운용', IBK: 'IBK자산운용',
  BNK: 'BNK자산운용', MIDAS: '마이다스에셋자산운용', FOCUS: '브이아이자산운용',
  HK: '흥국자산운용', '파워': '교보자산운용', UNICORN: '현대자산운용',
  DAISHIN: '대신자산운용', DS: 'DS자산운용', TREX: '유리자산운용',
  TRUSTON: '트러스톤자산운용', KCGI: 'KCGI자산운용',
  '아이엠에셋': 'iM에셋자산운용', '더제이': '더제이자산운용'
};

const BUCKETS = [
  { key: 'lt100', label: '100억 미만', min: 0, max: 100 },
  { key: '100to500', label: '100억~500억', min: 100, max: 500 },
  { key: '500to1000', label: '500억~1,000억', min: 500, max: 1000 },
  { key: '1000to5000', label: '1,000억~5,000억', min: 1000, max: 5000 },
  { key: 'gte5000', label: '5,000억 이상', min: 5000, max: Infinity }
];

const MARKET_COLORS = { 국내: '#3268e9', 해외: '#16a6a0', '기타·미확인': '#c4cedc' };
const numberFormat = new Intl.NumberFormat('ko-KR');
const collator = new Intl.Collator('ko-KR', { numeric: true });

const state = {
  items: [], filtered: [], metric: 'aum', page: 1, pageSize: 20,
  sort: 'aum', direction: 'desc', loading: false, nextRefreshAt: 0
};

const $ = (id) => document.getElementById(id);
const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function classifyMarket(name, code) {
  if ([1, 2, 3].includes(code)) return '국내';
  if (code === 4) return '해외';
  if (/미국|나스닥|S&P|글로벌|선진국|신흥국|일본|차이나|중국|인도|유럽|유로|독일|프랑스|영국|베트남|브라질|멕시코|아시아|월드|해외|MSCI World|US\b|U\.S\./i.test(name)) return '해외';
  if (/국내|한국|코리아|국고|국채|통안|회사채|금융채|단기채|종합채권|머니마켓|CD금리|CD1년|KOFR|KRX|코스피|코스닥|KOSPI|KOSDAQ|원화|K-반도체/i.test(name)) return '국내';
  return '기타·미확인';
}

function classifyType(name, code) {
  if (/채권혼합|주식혼합|TDF|멀티에셋|자산배분|혼합/i.test(name)) return '혼합·배분';
  if (/리츠|부동산|REIT/i.test(name)) return '리츠·부동산';
  if (/인버스|레버리지|2X|2배|커버드콜|Covered Call/i.test(name) || code === 3) return '파생·전략';
  if (/CD금리|CD1년|KOFR|머니마켓|초단기|금리액티브|단기금리|MMF/i.test(name)) return '금리·현금성';
  if (code === 5) return '원자재';
  if (code === 6 || /채권|국채|회사채|금융채|통안채|특수채|미국채|종합채/i.test(name)) return '채권';
  if ([1, 2, 4].includes(code)) return '주식';
  return '기타';
}

function bucketFor(value) {
  if (value === null || value < 0) return 'unknown';
  return BUCKETS.find((bucket) => value >= bucket.min && value < bucket.max)?.key ?? 'unknown';
}

function normalize(item) {
  const name = String(item.itemname || '').trim();
  const brand = name.split(/\s+/)[0];
  const code = safeNumber(item.etfTabCode);
  const price = safeNumber(item.nowVal);
  const nav = safeNumber(item.nav);
  const marketCap = safeNumber(item.marketSum); // Naver reports this in 억원.
  const aum = marketCap !== null && price > 0 && nav > 0
    ? marketCap * nav / price : null;
  return {
    code: String(item.itemcode || '').trim(), name, brand,
    manager: MANAGERS[brand] || '운용사 미확인',
    market: classifyMarket(name, code), type: classifyType(name, code),
    price, nav, marketCap, aum, aumBucket: bucketFor(aum),
    change: safeNumber(item.changeRate), return3m: safeNumber(item.threeMonthEarnRate)
  };
}

function formatEok(value, decimals = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 10000) return `${(value / 10000).toFixed(decimals)}조`;
  return `${numberFormat.format(Math.round(value))}억`;
}

function formatPercent(value, sign = false) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${sign && value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeClass(value) {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
}

function uniqueSorted(key) {
  return [...new Set(state.items.map((item) => item[key]))].sort(collator.compare);
}

function populateSelect(id, values) {
  const select = $(id);
  const chosen = select.value;
  select.replaceChildren(select.firstElementChild);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.value = values.includes(chosen) ? chosen : '';
}

function populateFilters() {
  populateSelect('manager', uniqueSorted('manager'));
  populateSelect('market', uniqueSorted('market'));
  populateSelect('type', uniqueSorted('type'));
  const select = $('aum');
  if (select.options.length === 1) {
    BUCKETS.forEach((bucket) => select.add(new Option(bucket.label, bucket.key)));
  }
}

function applyFilters() {
  const query = $('search').value.trim().toLocaleLowerCase('ko-KR');
  const manager = $('manager').value;
  const market = $('market').value;
  const type = $('type').value;
  const aum = $('aum').value;
  state.filtered = state.items.filter((item) =>
    (!query || [item.name, item.code, item.manager, item.brand].some((part) => part.toLocaleLowerCase('ko-KR').includes(query))) &&
    (!manager || item.manager === manager) &&
    (!market || item.market === market) &&
    (!type || item.type === type) &&
    (!aum || item.aumBucket === aum)
  );
  state.page = 1;
  render();
}

function sumAum(items) {
  return items.reduce((sum, item) => sum + (item.aum || 0), 0);
}

function renderKpis() {
  const items = state.filtered;
  const returns = items.map((item) => item.return3m).filter((value) => value !== null);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const rising = items.filter((item) => item.change > 0).length;
  $('kpi-count').textContent = numberFormat.format(items.length);
  $('kpi-aum').textContent = formatEok(sumAum(items));
  $('kpi-return').textContent = formatPercent(mean, true);
  $('kpi-return').className = changeClass(mean);
  $('kpi-rising').textContent = `${numberFormat.format(rising)}개`;
  $('result-count').textContent = numberFormat.format(items.length);
  $('manager-total').textContent = `${new Set(items.map((item) => item.manager)).size}개 운용사`;
}

function groupBy(key) {
  const groups = new Map();
  state.filtered.forEach((item) => {
    const label = item[key];
    if (!groups.has(label)) groups.set(label, { label, count: 0, aum: 0 });
    const group = groups.get(label);
    group.count += 1;
    group.aum += item.aum || 0;
  });
  return [...groups.values()].sort((a, b) => b[state.metric] - a[state.metric]);
}

function metricValue(group) {
  return state.metric === 'aum' ? formatEok(group.aum) : `${numberFormat.format(group.count)}개`;
}

function renderBarChart(id, groups, filterId) {
  const chart = $(id);
  chart.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = '해당 조건의 ETF가 없습니다.';
    chart.append(empty);
    return;
  }
  const max = Math.max(...groups.map((group) => group[state.metric]), 1);
  groups.forEach((group) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'bar-row';
    if (group.filterValue && $(filterId).value === group.filterValue) row.classList.add('selected');
    row.title = `${group.label}: ${numberFormat.format(group.count)}종목 · 추정 순자산 ${formatEok(group.aum)}`;
    const label = document.createElement('span');
    label.className = 'bar-label'; label.textContent = group.label;
    const track = document.createElement('span');
    track.className = 'bar-track';
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.width = `${group[state.metric] ? Math.max(1, group[state.metric] / max * 100) : 0}%`;
    track.append(fill);
    const value = document.createElement('span');
    value.className = 'bar-value'; value.textContent = metricValue(group);
    row.append(label, track, value);
    if (group.filterValue) {
      row.addEventListener('click', () => {
        $(filterId).value = $(filterId).value === group.filterValue ? '' : group.filterValue;
        applyFilters();
      });
    } else {
      row.disabled = true;
      row.style.cursor = 'default';
    }
    chart.append(row);
  });
}

function renderDonut() {
  const groups = groupBy('market');
  const total = groups.reduce((sum, group) => sum + group[state.metric], 0);
  const donut = $('market-donut');
  let cursor = 0;
  const stops = groups.map((group) => {
    const start = cursor;
    cursor += total ? group[state.metric] / total * 100 : 0;
    return `${MARKET_COLORS[group.label] || '#c4cedc'} ${start}% ${cursor}%`;
  });
  donut.style.background = stops.length ? `conic-gradient(${stops.join(',')})` : '#eef2f7';
  donut.setAttribute('aria-label', groups.map((group) => `${group.label} ${metricValue(group)}`).join(', ') || '데이터 없음');
  $('donut-total').textContent = state.metric === 'aum' ? formatEok(total) : numberFormat.format(total);
  $('donut-unit').textContent = state.metric === 'aum' ? '추정 순자산' : 'ETF 종목';
  const legend = $('market-legend');
  legend.replaceChildren();
  groups.forEach((group) => {
    const button = document.createElement('button');
    button.className = 'legend-item'; button.type = 'button';
    if ($('market').value === group.label) button.classList.add('selected');
    const dot = document.createElement('span'); dot.className = 'legend-dot';
    dot.style.background = MARKET_COLORS[group.label] || '#c4cedc';
    const label = document.createElement('span'); label.className = 'legend-label'; label.textContent = group.label;
    const value = document.createElement('span'); value.className = 'legend-value'; value.textContent = metricValue(group);
    button.append(dot, label, value);
    button.addEventListener('click', () => {
      $('market').value = $('market').value === group.label ? '' : group.label;
      applyFilters();
    });
    legend.append(button);
  });
}

function renderCharts() {
  const managerGroups = groupBy('manager');
  const topManagers = managerGroups.slice(0, 7).map((group) => ({ ...group, filterValue: group.label }));
  if (managerGroups.length > 7) {
    topManagers.push({
      label: '그 외 운용사',
      count: managerGroups.slice(7).reduce((sum, group) => sum + group.count, 0),
      aum: managerGroups.slice(7).reduce((sum, group) => sum + group.aum, 0)
    });
  }
  renderBarChart('manager-chart', topManagers, 'manager');
  renderDonut();
  renderBarChart('type-chart', groupBy('type').map((group) => ({ ...group, filterValue: group.label })), 'type');
  const buckets = BUCKETS.map((bucket) => {
    const matching = state.filtered.filter((item) => item.aumBucket === bucket.key);
    return { label: bucket.label, filterValue: bucket.key, count: matching.length, aum: sumAum(matching) };
  });
  renderBarChart('aum-chart', buckets, 'aum');
}

function sortedItems() {
  const key = state.sort;
  const items = [...state.filtered];
  items.sort((a, b) => {
    const left = a[key]; const right = b[key];
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    const order = typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left), String(right));
    return state.direction === 'asc' ? order : -order;
  });
  return items;
}

function appendCell(row, text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function renderTable() {
  const sorted = sortedItems();
  const pageCount = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageItems = sorted.slice(start, start + state.pageSize);
  const body = $('etf-rows');
  body.replaceChildren();
  if (!pageItems.length) {
    const row = document.createElement('tr');
    appendCell(row, state.items.length ? '검색 조건에 맞는 ETF가 없습니다.' : 'ETF 데이터를 불러오지 못했습니다.', 'empty-row').colSpan = 8;
    body.append(row);
  }
  pageItems.forEach((item) => {
    const row = document.createElement('tr');
    const first = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'etf-name'; link.textContent = item.name;
    if (/^[0-9A-Z]{6}$/.test(item.code)) {
      link.href = `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(item.code)}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
    const code = document.createElement('span');
    code.className = 'etf-code'; code.textContent = item.code;
    first.append(link, code); row.append(first);
    appendCell(row, item.manager, 'subtle');
    const market = appendCell(row, '');
    const marketTag = document.createElement('span');
    marketTag.className = `market-tag ${item.market === '해외' ? 'overseas' : item.market === '국내' ? '' : 'unknown'}`;
    marketTag.textContent = item.market; market.append(marketTag);
    const type = appendCell(row, '');
    const typeTag = document.createElement('span');
    typeTag.className = 'type-tag'; typeTag.textContent = item.type; type.append(typeTag);
    appendCell(row, item.price === null ? '—' : `${numberFormat.format(item.price)}원`, 'num');
    appendCell(row, formatPercent(item.change, true), `num ${changeClass(item.change)}`);
    appendCell(row, formatPercent(item.return3m, true), `num ${changeClass(item.return3m)}`);
    const aum = appendCell(row, '', 'num');
    const primary = document.createElement('span');
    primary.className = 'aum-primary'; primary.textContent = formatEok(item.aum);
    const secondary = document.createElement('span');
    secondary.className = 'aum-secondary'; secondary.textContent = `시총 ${formatEok(item.marketCap)}`;
    aum.append(primary, secondary);
    body.append(row);
  });
  $('table-caption').textContent = `전체 ${numberFormat.format(state.items.length)}개 중 ${numberFormat.format(sorted.length)}개 표시`;
  $('pagination-info').textContent = sorted.length
    ? `${numberFormat.format(start + 1)}–${numberFormat.format(Math.min(start + state.pageSize, sorted.length))} / ${numberFormat.format(sorted.length)}`
    : '0개';
  $('prev-page').disabled = state.page <= 1;
  $('next-page').disabled = state.page >= pageCount;
  const pageNumbers = $('page-numbers');
  pageNumbers.replaceChildren();
  const firstPage = Math.max(1, Math.min(state.page - 2, pageCount - 4));
  for (let page = firstPage; page <= Math.min(firstPage + 4, pageCount); page += 1) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = String(page);
    if (page === state.page) { button.className = 'active'; button.setAttribute('aria-current', 'page'); }
    button.addEventListener('click', () => { state.page = page; renderTable(); });
    pageNumbers.append(button);
  }
  document.querySelectorAll('.sort-button').forEach((button) => {
    const active = button.dataset.sort === state.sort;
    button.classList.toggle('active', active);
    button.querySelector('.sort-indicator').textContent = active ? (state.direction === 'desc' ? '▼' : '▲') : '';
  });
}

function render() {
  renderKpis();
  renderCharts();
  renderTable();
}

function showStatus(kind, text) {
  const status = $('feed-status');
  status.className = `status-chip ${kind || ''}`;
  status.innerHTML = '<span class="status-dot"></span>';
  status.append(document.createTextNode(text));
}

function showError(message) {
  const banner = $('error-banner');
  banner.textContent = message;
  banner.hidden = !message;
}

function loadJsonp() {
  return new Promise((resolve, reject) => {
    const callback = `__etfInsight_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('네이버 금융 응답 시간이 초과되었습니다.')), 15_000);
    let finished = false;
    function finish(error, payload) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.remove();
      delete window[callback];
      if (error) reject(error);
      else resolve(payload);
    }
    window[callback] = (data) => {
      if (data?.resultCode !== 'success' || !Array.isArray(data?.result?.etfItemList)) {
        finish(new Error('ETF 목록 응답 형식이 올바르지 않습니다.'));
        return;
      }
      finish(null, {
        items: data.result.etfItemList,
        fetched_at: new Date().toISOString(),
        source: 'https://finance.naver.com/api/sise/etfItemList.nhn',
        stale: false
      });
    };
    script.onerror = () => finish(new Error('네이버 금융 데이터를 불러오지 못했습니다.'));
    script.charset = 'euc-kr';
    const url = new URL('https://finance.naver.com/api/sise/etfItemList.nhn');
    url.searchParams.set('etfType', '0');
    url.searchParams.set('targetColumn', 'market_sum');
    url.searchParams.set('sortOrder', 'desc');
    url.searchParams.set('_callback', callback);
    url.searchParams.set('_', Date.now().toString());
    script.src = url.toString();
    document.head.append(script);
  });
}

async function loadEtfs(force) {
  const local = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  if (!local || new URLSearchParams(window.location.search).get('source') === 'jsonp') {
    return loadJsonp();
  }
  const response = await fetch(`/api/etfs${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function refresh(force = false) {
  if (state.loading) return;
  state.loading = true;
  $('refresh').disabled = true;
  showStatus('', '데이터 조회 중');
  try {
    const payload = await loadEtfs(force);
    if (!Array.isArray(payload.items)) throw new Error('응답 형식이 올바르지 않습니다.');
    state.items = payload.items.map(normalize).filter((item) => item.code && item.name);
    populateFilters();
    applyFilters();
    const loaded = new Date(payload.fetched_at);
    $('updated-at').textContent = `최근 조회 · ${loaded.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    if (payload.stale) {
      showStatus('stale', '이전 데이터 표시 중');
      showError('네이버 금융에 연결하지 못해 마지막으로 받은 데이터를 표시합니다. 잠시 후 다시 조회해 주세요.');
    } else {
      showStatus('', `${numberFormat.format(state.items.length)}개 ETF 연결됨`);
      showError('');
    }
  } catch (error) {
    showStatus('error', '데이터 연결 오류');
    showError(`${error.message} · 로컬 서버의 네트워크 연결을 확인해 주세요.`);
    if (!state.items.length) render();
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
    state.nextRefreshAt = Date.now() + 60_000;
  }
}

function downloadCsv() {
  const columns = ['종목코드', '종목명', '운용사', '투자시장', '상품유형', '현재가(원)', '전일대비(%)', '3개월수익률(%)', 'NAV(원)', '시가총액(억원)', '추정순자산총액(억원)'];
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [columns, ...sortedItems().map((item) => [
    item.code, item.name, item.manager, item.market, item.type,
    item.price, item.change, item.return3m, item.nav, item.marketCap,
    item.aum === null ? '' : item.aum.toFixed(2)
  ])].map((row) => row.map(escape).join(','));
  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `etf-insight-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

['manager', 'market', 'type', 'aum'].forEach((id) => $(id).addEventListener('change', applyFilters));
$('search').addEventListener('input', applyFilters);
$('reset-filters').addEventListener('click', () => {
  $('search').value = '';
  ['manager', 'market', 'type', 'aum'].forEach((id) => { $(id).value = ''; });
  applyFilters();
});
document.querySelectorAll('[data-metric]').forEach((button) => button.addEventListener('click', () => {
  state.metric = button.dataset.metric;
  document.querySelectorAll('[data-metric]').forEach((part) => {
    const active = part === button;
    part.classList.toggle('active', active);
    part.setAttribute('aria-pressed', String(active));
  });
  renderCharts();
}));
document.querySelectorAll('.sort-button').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.sort;
  if (state.sort === key) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  else { state.sort = key; state.direction = ['name', 'manager', 'market', 'type'].includes(key) ? 'asc' : 'desc'; }
  state.page = 1;
  renderTable();
}));
$('page-size').addEventListener('change', (event) => { state.pageSize = Number(event.target.value); state.page = 1; renderTable(); });
$('prev-page').addEventListener('click', () => { state.page -= 1; renderTable(); });
$('next-page').addEventListener('click', () => { state.page += 1; renderTable(); });
$('refresh').addEventListener('click', () => refresh(true));
$('download-csv').addEventListener('click', downloadCsv);
setInterval(() => { if (!state.loading && Date.now() >= state.nextRefreshAt) refresh(); }, 1000);
refresh();
