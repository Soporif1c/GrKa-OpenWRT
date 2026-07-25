'use strict';
'require view';
'require rpc';
'require ui';

var callGetConfig = rpc.declare({ object: 'luci.grka', method: 'get_config' });
var callSetConfig = rpc.declare({ object: 'luci.grka', method: 'set_config', params: ['content'] });
var callCheckConfig = rpc.declare({ object: 'luci.grka', method: 'check_config', params: ['content'] });
var callService = rpc.declare({ object: 'luci.grka', method: 'service', params: ['action'] });
var callListBackups = rpc.declare({ object: 'luci.grka', method: 'list_backups', expect: { backups: [] } });
var callRestoreBackup = rpc.declare({ object: 'luci.grka', method: 'restore_backup', params: ['name'] });

/* ---------- Парсер прокси-ссылок -> объект прокси mihomo ---------- */

function b64decode(s) {
	s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
	while (s.length % 4)
		s += '=';
	return decodeURIComponent(escape(window.atob(s)));
}

function parseQuery(q) {
	var out = {};
	(q || '').split('&').forEach(function(kv) {
		if (!kv) return;
		var i = kv.indexOf('=');
		var k = i < 0 ? kv : kv.slice(0, i);
		var v = i < 0 ? '' : kv.slice(i + 1);
		try { out[k] = decodeURIComponent(v.replace(/\+/g, '%20')); }
		catch (e) { out[k] = v; }
	});
	return out;
}

function parseUri(link) {
	var m = link.match(/^([a-z0-9]+):\/\/([^#]+)(?:#(.*))?$/i);
	if (!m)
		return null;
	var scheme = m[1].toLowerCase();
	var body = m[2];
	var name = '';
	try { name = m[3] ? decodeURIComponent(m[3]) : ''; }
	catch (e) { name = m[3] || ''; }

	var userinfo = null;
	var at = body.lastIndexOf('@');
	if (at >= 0) {
		userinfo = body.slice(0, at);
		body = body.slice(at + 1);
	}

	var query = '';
	var qi = body.indexOf('?');
	if (qi >= 0) {
		query = body.slice(qi + 1);
		body = body.slice(0, qi);
	}
	body = body.replace(/\/+$/, '').replace(/\/.*$/, '');

	var host = body, port = '';
	var pm = body.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
	if (pm) {
		host = pm[1].replace(/^\[|\]$/g, '');
		port = pm[2];
	}

	return {
		scheme: scheme,
		userinfo: userinfo,
		host: host,
		port: parseInt(port, 10) || 443,
		q: parseQuery(query),
		name: name
	};
}

function applyNetwork(p, net, u) {
	var q = u.q;
	net = net || 'tcp';
	if (net === 'tcp' || net === 'raw')
		return;
	p.network = net;
	if (net === 'ws') {
		p['ws-opts'] = { path: q.path || '/' };
		if (q.host)
			p['ws-opts'].headers = { Host: q.host };
	} else if (net === 'grpc') {
		p['grpc-opts'] = { 'grpc-service-name': q.serviceName || q.path || '' };
	} else if (net === 'http' || net === 'h2') {
		p.network = 'h2';
		p['h2-opts'] = { path: q.path || '/' };
		if (q.host)
			p['h2-opts'].host = [ q.host ];
	}
}

function parseProxyLink(link) {
	link = (link || '').trim();
	var u;

	if (/^vmess:\/\//i.test(link)) {
		var v = JSON.parse(b64decode(link.slice(8)));
		var p = {
			name: v.ps || (v.add + ':' + v.port),
			type: 'vmess',
			server: v.add,
			port: parseInt(v.port, 10),
			uuid: v.id,
			alterId: parseInt(v.aid, 10) || 0,
			cipher: v.scy || 'auto',
			udp: true
		};
		if (v.tls === 'tls' || v.tls === true) {
			p.tls = true;
			if (v.sni || v.host)
				p.servername = v.sni || v.host;
		}
		var net = v.net || 'tcp';
		if (net !== 'tcp') {
			p.network = net;
			if (net === 'ws') {
				p['ws-opts'] = { path: v.path || '/' };
				if (v.host)
					p['ws-opts'].headers = { Host: v.host };
			} else if (net === 'grpc') {
				p['grpc-opts'] = { 'grpc-service-name': v.path || '' };
			}
		}
		return p;
	}

	u = parseUri(link);
	if (!u)
		throw new Error('Не удалось разобрать ссылку');

	if (u.scheme === 'vless') {
		var q = u.q;
		var p2 = {
			name: u.name || (u.host + ':' + u.port),
			type: 'vless',
			server: u.host,
			port: u.port,
			uuid: u.userinfo,
			udp: true
		};
		if (q.flow)
			p2.flow = q.flow;
		if (q.security === 'tls' || q.security === 'reality') {
			p2.tls = true;
			if (q.sni)
				p2.servername = q.sni;
			p2['client-fingerprint'] = q.fp || 'chrome';
		}
		if (q.security === 'reality') {
			p2['reality-opts'] = { 'public-key': q.pbk || '' };
			if (q.sid)
				p2['reality-opts']['short-id'] = q.sid;
		}
		if (q.alpn)
			p2.alpn = q.alpn.split(',');
		applyNetwork(p2, q.type, u);
		return p2;
	}

	if (u.scheme === 'trojan') {
		var q3 = u.q;
		var p3 = {
			name: u.name || (u.host + ':' + u.port),
			type: 'trojan',
			server: u.host,
			port: u.port,
			password: u.userinfo,
			udp: true
		};
		if (q3.sni)
			p3.sni = q3.sni;
		if (q3.allowInsecure === '1' || q3.insecure === '1')
			p3['skip-cert-verify'] = true;
		if (q3.fp)
			p3['client-fingerprint'] = q3.fp;
		applyNetwork(p3, q3.type, u);
		return p3;
	}

	if (u.scheme === 'ss') {
		var method, password, host = u.host, port = u.port, name = u.name;
		if (u.userinfo !== null) {
			var creds;
			try {
				creds = b64decode(u.userinfo);
				if (creds.indexOf(':') < 0)
					throw new Error('no colon');
			} catch (e) {
				try { creds = decodeURIComponent(u.userinfo); }
				catch (e2) { creds = u.userinfo; }
			}
			var ci = creds.indexOf(':');
			method = creds.slice(0, ci);
			password = creds.slice(ci + 1);
		} else {
			var full = b64decode(link.slice(5).split('#')[0]);
			var fm = full.match(/^(.+?):(.+)@(.+):(\d+)$/);
			if (!fm)
				throw new Error('Не удалось разобрать ss-ссылку');
			method = fm[1];
			password = fm[2];
			host = fm[3];
			port = parseInt(fm[4], 10);
		}
		return {
			name: name || (host + ':' + port),
			type: 'ss',
			server: host,
			port: port,
			cipher: method,
			password: password,
			udp: true
		};
	}

	if (u.scheme === 'hysteria2' || u.scheme === 'hy2') {
		var q4 = u.q;
		var p4 = {
			name: u.name || (u.host + ':' + u.port),
			type: 'hysteria2',
			server: u.host,
			port: u.port,
			password: u.userinfo || ''
		};
		if (q4.sni)
			p4.sni = q4.sni;
		if (q4.insecure === '1')
			p4['skip-cert-verify'] = true;
		if (q4.obfs)
			p4.obfs = q4.obfs;
		if (q4['obfs-password'])
			p4['obfs-password'] = q4['obfs-password'];
		return p4;
	}

	if (u.scheme === 'tuic') {
		var q5 = u.q;
		var creds5 = (u.userinfo || '').split(':');
		var p5 = {
			name: u.name || (u.host + ':' + u.port),
			type: 'tuic',
			server: u.host,
			port: u.port,
			uuid: creds5[0] || '',
			password: creds5[1] || ''
		};
		if (q5.sni)
			p5.sni = q5.sni;
		if (q5.congestion_control)
			p5['congestion-controller'] = q5.congestion_control;
		if (q5.alpn)
			p5.alpn = q5.alpn.split(',');
		return p5;
	}

	throw new Error('Схема «' + u.scheme + '://» не поддерживается. Поддерживаются: vless, vmess, trojan, ss, hysteria2, tuic');
}

/* JSON — подмножество YAML, поэтому объект прокси можно вставить как flow-map */
function proxyToYaml(p) {
	return '  - ' + JSON.stringify(p);
}

function insertProxyIntoConfig(cfg, yamlLine) {
	var emptyRe = /^proxies:[ \t]*\[\][ \t]*$/m;
	if (emptyRe.test(cfg))
		return cfg.replace(emptyRe, 'proxies:\n' + yamlLine);

	var m = cfg.match(/^proxies:[ \t]*$/m);
	if (m) {
		var idx = m.index + m[0].length;
		return cfg.slice(0, idx) + '\n' + yamlLine + cfg.slice(idx);
	}
	return cfg.replace(/\s*$/, '') + '\n\nproxies:\n' + yamlLine + '\n';
}

/* ------------------------------------------------------------------ */

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return callGetConfig().catch(function() { return { content: '' }; });
	},

	handleCheck: function() {
		var self = this;
		return callCheckConfig(this.textarea.value).then(function(res) {
			ui.showModal(res.ok ? '✅ Конфигурация корректна' : '❌ Ошибка в конфигурации', [
				E('pre', { 'style': 'max-height:50vh;overflow:auto;white-space:pre-wrap' }, res.output || ''),
				E('div', { 'class': 'right' },
					E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Закрыть'))
			]);
		});
	},

	doSave: function(restart) {
		var self = this;
		return callSetConfig(this.textarea.value).then(function() {
			if (restart)
				return callService('restart');
		}).then(function() {
			ui.addNotification(null, E('p', {}, restart
				? 'Конфигурация сохранена, mihomo перезапущен'
				: 'Конфигурация сохранена'), 'info');
		});
	},

	handleSaveConfig: function() {
		return this.doSave(false);
	},

	handleSaveRestart: function() {
		var self = this;
		return callCheckConfig(this.textarea.value).then(function(res) {
			if (!res.ok) {
				ui.showModal('❌ Конфигурация не прошла проверку — не сохранено', [
					E('pre', { 'style': 'max-height:50vh;overflow:auto;white-space:pre-wrap' }, res.output || ''),
					E('div', { 'class': 'right' },
						E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Закрыть'))
				]);
				return;
			}
			return self.doSave(true);
		});
	},

	handleBackups: function() {
		var self = this;
		return callListBackups().then(function(backups) {
			var rows = (backups || []).map(function(name) {
				return E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;padding:.25em 0;border-bottom:1px solid #eee' }, [
					E('code', {}, name),
					E('button', {
						'class': 'btn cbi-button cbi-button-apply',
						'click': function() {
							callRestoreBackup(name).then(function(res) {
								if (res && res.ok) {
									ui.hideModal();
									return callGetConfig().then(function(r) {
										self.textarea.value = r.content || '';
										ui.addNotification(null, E('p', {}, 'Бэкап восстановлен (перезапустите mihomo для применения)'), 'info');
									});
								}
								ui.addNotification(null, E('p', {}, (res && res.error) || 'Ошибка восстановления'), 'error');
							});
						}
					}, 'Восстановить')
				]);
			});
			ui.showModal('Бэкапы конфигурации', [
				E('div', { 'class': 'cbi-map-descr' }, 'Бэкап создаётся автоматически при каждом сохранении (хранятся последние 10).'),
				rows.length ? E('div', {}, rows) : E('p', {}, 'Бэкапов пока нет'),
				E('div', { 'class': 'right' },
					E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Закрыть'))
			]);
		});
	},

	handleAddProxy: function() {
		var self = this;
		var input = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width:100%',
			'placeholder': 'vless:// vmess:// trojan:// ss:// hysteria2:// tuic://'
		});
		var preview = E('pre', { 'style': 'max-height:30vh;overflow:auto;white-space:pre-wrap;background:rgba(0,0,0,.05);padding:.5em;display:none' }, '');
		var errBox = E('p', { 'style': 'color:#c0392b;display:none' }, '');
		var btnInsert = E('button', { 'class': 'btn cbi-button cbi-button-apply', 'disabled': 'disabled', 'style': 'margin-left:.5em' }, 'Вставить в конфиг');
		var generated = null;

		var btnGen = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': function() {
				errBox.style.display = 'none';
				preview.style.display = 'none';
				generated = null;
				btnInsert.setAttribute('disabled', 'disabled');
				try {
					var p = parseProxyLink(input.value);
					generated = proxyToYaml(p);
					preview.textContent = generated;
					preview.style.display = '';
					btnInsert.removeAttribute('disabled');
				} catch (e) {
					errBox.textContent = 'Ошибка: ' + (e.message || e);
					errBox.style.display = '';
				}
			}
		}, 'Сгенерировать');

		btnInsert.onclick = function() {
			if (!generated)
				return;
			self.textarea.value = insertProxyIntoConfig(self.textarea.value, generated);
			ui.hideModal();
			ui.addNotification(null, E('p', {}, 'Прокси добавлен в раздел proxies. Не забудьте прописать его имя в proxy-groups/rules и сохранить конфиг.'), 'info');
		};

		ui.showModal('Добавить прокси из ссылки', [
			E('p', {}, 'Вставьте ссылку на прокси — она будет преобразована в формат mihomo:'),
			input,
			errBox,
			preview,
			E('div', { 'class': 'right', 'style': 'margin-top:.5em' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Отмена'),
				E('span', { 'style': 'margin-left:.5em' }, btnGen),
				btnInsert
			])
		]);
		input.focus();
	},

	render: function(data) {
		var self = this;

		this.textarea = E('textarea', {
			'style': 'width:100%;min-height:60vh;font-family:monospace;font-size:12px;line-height:1.4;white-space:pre;resize:vertical',
			'spellcheck': 'false',
			'wrap': 'off',
			'keydown': function(ev) {
				if (ev.key === 'Tab') {
					ev.preventDefault();
					var t = ev.target;
					var s = t.selectionStart, e = t.selectionEnd;
					t.value = t.value.slice(0, s) + '  ' + t.value.slice(e);
					t.selectionStart = t.selectionEnd = s + 2;
				}
			}
		}, [ (data && data.content) || '' ]);

		return E('div', {}, [
			E('h2', {}, 'Конфигурация mihomo'),
			E('div', { 'class': 'cbi-map-descr' }, [
				'Файл ',
				E('code', {}, '/etc/mihomo/config.yaml'),
				'. Перед сохранением с перезапуском конфигурация автоматически проверяется.'
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'margin-bottom:.5em' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'handleAddProxy') }, 'Добавить прокси из ссылки'),
					E('button', { 'class': 'btn cbi-button cbi-button-neutral', 'style': 'margin-left:.5em', 'click': ui.createHandlerFn(this, 'handleBackups') }, 'Бэкапы')
				]),
				this.textarea,
				E('div', { 'style': 'margin-top:.5em' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleCheck') }, 'Проверить'),
					E('button', { 'class': 'btn cbi-button cbi-button-save', 'style': 'margin-left:.5em', 'click': ui.createHandlerFn(this, 'handleSaveConfig') }, 'Сохранить'),
					E('button', { 'class': 'btn cbi-button cbi-button-apply', 'style': 'margin-left:.5em', 'click': ui.createHandlerFn(this, 'handleSaveRestart') }, 'Сохранить и перезапустить')
				])
			])
		]);
	}
});
