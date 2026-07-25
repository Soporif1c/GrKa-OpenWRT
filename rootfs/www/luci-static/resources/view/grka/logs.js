'use strict';
'require view';
'require rpc';
'require poll';

var callGetLog = rpc.declare({ object: 'luci.grka', method: 'get_log', params: ['lines'] });

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	raw: '',
	paused: false,

	load: function() {
		return callGetLog(200).catch(function() { return { log: '' }; });
	},

	applyFilter: function() {
		var filter = (this.filterInput.value || '').toLowerCase();
		var text = this.raw;
		if (filter) {
			text = text.split('\n').filter(function(line) {
				return line.toLowerCase().indexOf(filter) >= 0;
			}).join('\n');
		}
		this.pre.textContent = text || '(пусто)';
		if (this.autoscroll.checked)
			this.pre.scrollTop = this.pre.scrollHeight;
	},

	fetchLog: function() {
		var self = this;
		if (this.paused)
			return Promise.resolve();
		return callGetLog(parseInt(this.linesSelect.value, 10)).then(function(res) {
			self.raw = (res && res.log) || '';
			self.applyFilter();
		}).catch(function() {});
	},

	render: function(data) {
		var self = this;

		this.raw = (data && data.log) || '';

		this.pre = E('pre', {
			'style': 'height:65vh;overflow:auto;font-size:12px;line-height:1.35;padding:.5em;border:1px solid #ccc;white-space:pre-wrap;word-break:break-all'
		}, '');

		this.filterInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': 'Фильтр (например: error, warning, dns)...',
			'style': 'width:20em',
			'input': function() { self.applyFilter(); }
		});

		this.linesSelect = E('select', { 'class': 'cbi-input-select', 'style': 'margin-left:.5em' }, [
			E('option', { 'value': '100' }, '100 строк'),
			E('option', { 'value': '200', 'selected': 'selected' }, '200 строк'),
			E('option', { 'value': '500' }, '500 строк'),
			E('option', { 'value': '1000' }, '1000 строк')
		]);

		this.autoscroll = E('input', { 'type': 'checkbox', 'checked': 'checked' });

		var pauseBtn = E('button', {
			'class': 'btn cbi-button cbi-button-neutral',
			'style': 'margin-left:.5em',
			'click': function(ev) {
				self.paused = !self.paused;
				ev.target.textContent = self.paused ? 'Продолжить' : 'Пауза';
			}
		}, 'Пауза');

		var layout = E('div', {}, [
			E('h2', {}, 'Логи mihomo'),
			E('div', { 'class': 'cbi-map-descr' }, 'Журнал сервиса из системного лога (logread), автообновление каждые 3 секунды.'),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'margin-bottom:.5em;display:flex;align-items:center;flex-wrap:wrap;gap:.25em' }, [
					this.filterInput,
					this.linesSelect,
					pauseBtn,
					E('label', { 'style': 'margin-left:1em' }, [ this.autoscroll, ' автопрокрутка' ])
				]),
				this.pre
			])
		]);

		this.applyFilter();
		poll.add(this.fetchLog.bind(this), 3);

		return layout;
	}
});
