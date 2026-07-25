'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callStatus = rpc.declare({ object: 'luci.grka', method: 'status' });
var callService = rpc.declare({ object: 'luci.grka', method: 'service', params: ['action'] });
var callCheckUpdates = rpc.declare({ object: 'luci.grka', method: 'check_updates' });
var callUpdateCore = rpc.declare({ object: 'luci.grka', method: 'update_core', params: ['version'] });
var callUpdatePanel = rpc.declare({ object: 'luci.grka', method: 'update_panel' });
var callInstallDashboard = rpc.declare({ object: 'luci.grka', method: 'install_dashboard' });
var callTaskStatus = rpc.declare({ object: 'luci.grka', method: 'task_status' });

function row(label, node) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, label),
		E('div', { 'class': 'cbi-value-field' }, node)
	]);
}

function fmtMem(kb) {
	var n = parseInt(kb, 10);
	if (isNaN(n) || n <= 0)
		return '';
	if (n >= 1024)
		return (n / 1024).toFixed(1) + ' МБ';
	return n + ' КБ';
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return callStatus().catch(function() { return {}; });
	},

	refresh: function() {
		var self = this;
		return callStatus().then(function(st) {
			self.updateStatus(st);
		}).catch(function() {});
	},

	updateStatus: function(st) {
		var u = this.el;
		st = st || {};

		u.state.textContent = st.running ? 'запущен' : 'остановлен';
		u.state.style.color = st.running ? '#2ea44f' : '#c0392b';
		u.state.style.fontWeight = 'bold';

		var details = [];
		if (st.running && st.pid)
			details.push('PID ' + st.pid);
		if (st.running && st.memory)
			details.push('память: ' + fmtMem(st.memory));
		u.details.textContent = details.length ? ' (' + details.join(', ') + ')' : '';

		u.coreVersion.textContent = st.core_installed
			? (st.core_version || 'неизвестно') + (st.arch ? ' [' + st.arch + ']' : '')
			: 'не установлено';
		u.coreVersion2.textContent = st.core_installed ? (st.core_version || 'неизвестно') : 'не установлено';
		u.panelVersion.textContent = st.panel_version || '—';
		u.autostart.checked = !!st.autostart;

		u.btnStart.disabled = !!st.running || !st.core_installed;
		u.btnStop.disabled = !st.running;
		u.btnRestart.disabled = !st.running;
		u.btnCoreUpdate.firstChild.data = st.core_installed ? 'Обновить ядро' : 'Установить ядро';

		u.dashState.textContent = st.dashboard_installed ? 'установлен' : 'не установлен';
		u.dashLink.style.display = (st.dashboard_installed && st.running) ? '' : 'none';
		u.dashLink.href = 'http://' + window.location.hostname + ':' + (st.api_port || '9090') + '/ui/';
	},

	serviceAction: function(action) {
		var self = this;
		return callService(action).then(function() {
			return self.refresh();
		});
	},

	pollTask: function(pre, done) {
		var timer = window.setInterval(function() {
			callTaskStatus().then(function(t) {
				pre.textContent = t.log || '...';
				pre.scrollTop = pre.scrollHeight;
				if (!t.running) {
					window.clearInterval(timer);
					done();
				}
			}).catch(function() { /* rpcd может перезапускаться при самообновлении */ });
		}, 2000);
	},

	runTask: function(startPromise, title) {
		var self = this;
		return startPromise.then(function(res) {
			if (!res || !res.started) {
				ui.addNotification(null, E('p', {}, (res && res.error) || 'Не удалось запустить задачу'), 'error');
				return;
			}
			var pre = E('pre', {
				'style': 'max-height:50vh;overflow:auto;padding:.5em;border:1px solid #ccc;white-space:pre-wrap'
			}, 'Запуск...');
			var btn = E('button', { 'class': 'btn', 'disabled': 'disabled' }, 'Выполняется...');
			ui.showModal(title, [ pre, E('div', { 'class': 'right' }, btn) ]);
			self.pollTask(pre, function() {
				btn.removeAttribute('disabled');
				btn.textContent = 'Закрыть';
				btn.onclick = function() {
					ui.hideModal();
					self.refresh();
				};
			});
		});
	},

	handleCheckUpdates: function() {
		var self = this;
		return callCheckUpdates().then(function(res) {
			var coreLatest = res.core_latest || '';
			var panelLatest = res.panel_latest || '';

			self.el.coreLatest.textContent = coreLatest || 'не удалось получить';
			self.el.panelLatest.textContent = panelLatest || 'не удалось получить';

			var coreNew = coreLatest && coreLatest !== res.core_current;
			var panelNew = panelLatest && panelLatest !== res.panel_current;

			self.el.coreLatest.style.color = coreNew ? '#2ea44f' : '';
			self.el.panelLatest.style.color = panelNew ? '#2ea44f' : '';

			if (panelNew)
				self.el.btnPanelUpdate.removeAttribute('disabled');
			else
				self.el.btnPanelUpdate.setAttribute('disabled', 'disabled');
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка проверки обновлений: ' + e), 'error');
		});
	},

	render: function(st) {
		var self = this;

		this.el = {
			state: E('span', {}, '—'),
			details: E('span', { 'style': 'color:#888' }, ''),
			coreVersion: E('span', {}, '—'),
			coreVersion2: E('span', {}, '—'),
			coreLatest: E('span', {}, '—'),
			panelVersion: E('span', {}, '—'),
			panelLatest: E('span', {}, '—'),
			dashState: E('span', {}, '—'),
			dashLink: E('a', { 'href': '#', 'target': '_blank', 'style': 'margin-left:1em;display:none' }, 'Открыть дашборд ↗'),
			autostart: E('input', {
				'type': 'checkbox',
				'change': function(ev) {
					self.serviceAction(ev.target.checked ? 'enable' : 'disable');
				}
			}),
			btnStart: E('button', {
				'class': 'btn cbi-button cbi-button-positive',
				'click': ui.createHandlerFn(this, 'serviceAction', 'start')
			}, 'Запустить'),
			btnStop: E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'style': 'margin-left:.5em',
				'click': ui.createHandlerFn(this, 'serviceAction', 'stop')
			}, 'Остановить'),
			btnRestart: E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'style': 'margin-left:.5em',
				'click': ui.createHandlerFn(this, 'serviceAction', 'restart')
			}, 'Перезапустить'),
			btnCoreUpdate: E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': function() {
					self.runTask(callUpdateCore(''), 'Обновление ядра mihomo');
				}
			}, 'Обновить ядро'),
			btnPanelUpdate: E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'disabled': 'disabled',
				'click': function() {
					self.runTask(callUpdatePanel(), 'Обновление панели GrKa OpenWRT');
				}
			}, 'Обновить панель'),
			btnCheckUpdates: E('button', {
				'class': 'btn cbi-button cbi-button-neutral',
				'click': ui.createHandlerFn(this, 'handleCheckUpdates')
			}, 'Проверить обновления'),
			btnDashInstall: E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': function() {
					self.runTask(callInstallDashboard(), 'Установка дашборда MetaCubeXD');
				}
			}, 'Установить / обновить дашборд')
		};

		var u = this.el;

		var layout = E('div', {}, [
			E('h2', {}, 'GrKa OpenWRT'),
			E('div', { 'class': 'cbi-map-descr' }, 'Панель управления mihomo для OpenWRT. Ядро загружается с официального репозитория MetaCubeX/mihomo.'),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'Сервис mihomo'),
				row('Состояние', [ u.state, u.details ]),
				row('Версия ядра', u.coreVersion),
				row('Автозапуск', u.autostart),
				row('Управление', [ u.btnStart, u.btnStop, u.btnRestart ])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'Обновления'),
				row('Ядро mihomo', [
					E('span', {}, [ u.coreVersion2, E('span', { 'style': 'color:#888' }, ' → последняя: ' ), u.coreLatest ])
				]),
				row('Панель GrKa', [
					E('span', {}, [ u.panelVersion, E('span', { 'style': 'color:#888' }, ' → последняя: ' ), u.panelLatest ])
				]),
				row('Действия', [
					u.btnCheckUpdates,
					E('span', { 'style': 'margin-left:.5em' }, u.btnCoreUpdate),
					E('span', { 'style': 'margin-left:.5em' }, u.btnPanelUpdate)
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'Дашборд (Clash API)'),
				E('div', { 'class': 'cbi-map-descr' },
					'MetaCubeXD — веб-дашборд mihomo: соединения, выбор прокси в группах, скорость, правила.'),
				row('Состояние', [ u.dashState, u.dashLink ]),
				row('Действия', u.btnDashInstall)
			])
		]);

		this.updateStatus(st);
		poll.add(this.refresh.bind(this), 5);

		return layout;
	}
});
