'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require dom';

var callStatus = rpc.declare({ object: 'luci.grka', method: 'status' });

var TEST_URL = 'https://www.gstatic.com/generate_204';

var CSS = '' +
	'.grka-group { border:1px solid #e3e3e3; border-radius:4px; padding:10px 16px 14px; margin-bottom:14px; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.05) }' +
	'.grka-ghead { display:flex; align-items:center; gap:8px; margin-bottom:2px }' +
	'.grka-ghead img { width:20px; height:20px; object-fit:contain }' +
	'.grka-ghead h3 { font-size:15px; margin:0; border:none; padding:0 }' +
	'.grka-ghead .spacer { flex:1 }' +
	'.grka-chain { color:#888; font-size:12px; margin:2px 0 10px }' +
	'.grka-plist { display:flex; flex-wrap:wrap; gap:8px }' +
	'.grka-proxy { border:1px solid #ccc; border-radius:4px; padding:7px 12px; cursor:pointer; min-width:160px; background:#fff }' +
	'.grka-proxy:hover { border-color:#337ab7 }' +
	'.grka-proxy.active { border-color:#337ab7; background:rgba(51,122,183,.09); box-shadow:inset 0 0 0 1px #337ab7 }' +
	'.grka-proxy .pname { font-size:13px; font-weight:600 }' +
	'.grka-proxy .sub { color:#888; font-size:11px; display:flex; justify-content:space-between; gap:10px; margin-top:3px }' +
	'.grka-delay-ok { color:#2ea44f } .grka-delay-mid { color:#d69e00 } .grka-delay-bad { color:#c0392b } .grka-delay-na { color:#999 }' +
	'.grka-toolbar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center }';

function lastDelay(p) {
	if (p && Array.isArray(p.history) && p.history.length)
		return p.history[p.history.length - 1].delay;
	return null;
}

function delayBadge(d) {
	if (d === null || d === undefined)
		return E('span', { 'class': 'grka-delay-na' }, '—');
	if (!d)
		return E('span', { 'class': 'grka-delay-bad' }, 'timeout');
	var cls = d < 200 ? 'grka-delay-ok' : (d < 500 ? 'grka-delay-mid' : 'grka-delay-bad');
	return E('span', { 'class': cls }, d + ' ms');
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	st: null,

	apiBase: function() {
		return 'http://' + window.location.hostname + ':' + ((this.st && this.st.api_port) || '9090');
	},

	api: function(method, path, body) {
		var headers = {};
		if (this.st && this.st.api_secret)
			headers['Authorization'] = 'Bearer ' + this.st.api_secret;
		return window.fetch(this.apiBase() + path, {
			method: method,
			headers: headers,
			body: body ? JSON.stringify(body) : undefined
		}).then(function(r) {
			if (!r.ok)
				throw new Error('HTTP ' + r.status);
			return r.json().catch(function() { return null; });
		});
	},

	load: function() {
		var self = this;
		return callStatus().then(function(st) {
			self.st = st || {};
			if (!self.st.running)
				return null;
			return self.api('GET', '/proxies').catch(function() { return null; });
		}).catch(function() {
			self.st = {};
			return null;
		});
	},

	refresh: function() {
		var self = this;
		return callStatus().then(function(st) {
			self.st = st || {};
			if (!self.st.running)
				return null;
			return self.api('GET', '/proxies').catch(function() { return null; });
		}).then(function(data) {
			dom.content(self.contentEl, self.buildContent(data));
		}).catch(function() {});
	},

	chainOf: function(proxies, name) {
		var parts = [], seen = {}, cur = name;
		while (cur && proxies[cur] && proxies[cur].now && !seen[cur]) {
			seen[cur] = true;
			cur = proxies[cur].now;
			parts.push(cur);
		}
		return parts.join(' → ');
	},

	selectProxy: function(group, name) {
		var self = this;
		return this.api('PUT', '/proxies/' + encodeURIComponent(group), { name: name }).then(function() {
			return self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Не удалось выбрать прокси: ' + e), 'error');
		});
	},

	testGroup: function(group, btn) {
		var self = this;
		btn.textContent = '…';
		btn.setAttribute('disabled', 'disabled');
		return this.api('GET', '/group/' + encodeURIComponent(group) + '/delay?url=' +
			encodeURIComponent(TEST_URL) + '&timeout=5000').catch(function() {}).then(function() {
			return self.refresh();
		});
	},

	updateProviders: function(kind, label) {
		var self = this;
		return this.api('GET', '/providers/' + kind).then(function(d) {
			var provs = (d && d.providers) || {};
			var names = Object.keys(provs).filter(function(n) {
				return provs[n].vehicleType === 'HTTP';
			});
			if (!names.length) {
				ui.addNotification(null, E('p', {}, 'Нет загружаемых (HTTP) ' + label + ' для обновления'), 'info');
				return;
			}
			var failed = [];
			return Promise.all(names.map(function(n) {
				return self.api('PUT', '/providers/' + kind + '/' + encodeURIComponent(n)).catch(function() {
					failed.push(n);
				});
			})).then(function() {
				var msg = 'Обновлено ' + (names.length - failed.length) + ' из ' + names.length + ' ' + label;
				if (failed.length)
					msg += '. Ошибки: ' + failed.join(', ');
				ui.addNotification(null, E('p', {}, msg), failed.length ? 'error' : 'info');
			});
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка запроса к Clash API: ' + e), 'error');
		});
	},

	buildContent: function(data) {
		var self = this;

		if (!this.st || !this.st.running)
			return [ E('div', { 'class': 'alert-message warning' },
				'Сервис mihomo не запущен. Запустите его на вкладке «Статус» — селекторы работают через Clash API работающего mihomo.') ];

		if (!data || !data.proxies)
			return [ E('div', { 'class': 'alert-message warning' }, [
				E('p', {}, 'Clash API недоступен (' + this.apiBase() + '). Проверьте:'),
				E('ul', {}, [
					E('li', {}, 'в конфиге задано external-controller: 0.0.0.0:9090'),
					E('li', {}, 'mihomo перезапущен после изменения конфига'),
					E('li', {}, 'страница LuCI открыта по http (не https), иначе браузер блокирует запросы')
				])
			]) ];

		var proxies = data.proxies;
		var order = (proxies.GLOBAL && Array.isArray(proxies.GLOBAL.all)) ? proxies.GLOBAL.all : Object.keys(proxies);
		var groups = order.filter(function(n) {
			var p = proxies[n];
			return p && p.type === 'Selector' && Array.isArray(p.all) && n !== 'GLOBAL';
		});

		if (!groups.length)
			return [ E('div', { 'class': 'alert-message notice' },
				'В конфигурации нет групп типа select. Добавьте proxy-groups (например, через шаблон «Сервисы и селекторы» на вкладке «Конфигурация»).') ];

		return groups.map(function(gname) {
			var g = proxies[gname];
			var testBtn = E('button', { 'class': 'btn cbi-button cbi-button-neutral', 'title': 'Замерить задержки' }, '⚡');
			testBtn.onclick = function() { self.testGroup(gname, testBtn); };

			var cards = g.all.map(function(pname) {
				var p = proxies[pname] || {};
				var isGroup = Array.isArray(p.all);
				var sub = (p.type || '').toLowerCase() + (p.udp ? ' / udp' : '');
				var card = E('div', {
					'class': 'grka-proxy' + (g.now === pname ? ' active' : ''),
					'title': isGroup ? 'Группа' : 'Прокси'
				}, [
					E('div', { 'class': 'pname' }, pname),
					E('div', { 'class': 'sub' }, [
						E('span', {}, sub),
						delayBadge(isGroup ? lastDelay(proxies[self.chainEnd(proxies, pname)]) : lastDelay(p))
					])
				]);
				card.onclick = function() { self.selectProxy(gname, pname); };
				return card;
			});

			var head = [];
			if (g.icon)
				head.push(E('img', { 'src': g.icon, 'onerror': 'this.style.display="none"' }));
			head.push(E('h3', {}, gname));
			head.push(E('span', { 'class': 'spacer' }));
			head.push(testBtn);

			return E('div', { 'class': 'grka-group' }, [
				E('div', { 'class': 'grka-ghead' }, head),
				E('div', { 'class': 'grka-chain' }, 'Selector (' + g.all.length + ') → ' + (self.chainOf(proxies, gname) || '—')),
				E('div', { 'class': 'grka-plist' }, cards)
			]);
		});
	},

	chainEnd: function(proxies, name) {
		var seen = {}, cur = name;
		while (cur && proxies[cur] && proxies[cur].now && !seen[cur]) {
			seen[cur] = true;
			cur = proxies[cur].now;
		}
		return cur;
	},

	render: function(data) {
		var self = this;

		this.contentEl = E('div', {}, this.buildContent(data));

		var btnRules = E('button', { 'class': 'btn cbi-button cbi-button-action' }, 'Обновить провайдеры правил');
		btnRules.onclick = ui.createHandlerFn(this, 'updateProviders', 'rules', 'провайдеров правил');
		var btnProxies = E('button', { 'class': 'btn cbi-button cbi-button-action' }, 'Обновить прокси-провайдеры');
		btnProxies.onclick = ui.createHandlerFn(this, 'updateProviders', 'proxies', 'прокси-провайдеров');
		var btnRefresh = E('button', { 'class': 'btn cbi-button cbi-button-neutral' }, 'Обновить');
		btnRefresh.onclick = ui.createHandlerFn(this, 'refresh');

		poll.add(this.refresh.bind(this), 10);

		return E('div', {}, [
			E('style', {}, CSS),
			E('h2', {}, 'Селекторы'),
			E('div', { 'class': 'cbi-map-descr' },
				'Выбор активного подключения для каждой группы. Клик по карточке — выбрать, ⚡ — замерить задержки группы. Данные из Clash API работающего mihomo.'),
			E('div', { 'class': 'grka-toolbar' }, [ btnRules, btnProxies, btnRefresh ]),
			this.contentEl
		]);
	}
});
