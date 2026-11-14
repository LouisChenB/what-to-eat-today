Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    dish: Object,
    selectable: Boolean,
    selected: Boolean,
    compact: Boolean,
  },

  methods: {
    openDetail() { wx.navigateTo({ url: this.properties.dish.detailUrl }); },
    toggle() { this.triggerEvent('selection', { id: this.properties.dish.id }); },
  },
});
