const { getNavigationLayout, goBack } = require('../../lib/navigation');

Component({
  data: { height: 44, center: 22 },

  lifetimes: {
    attached() {
      const { height, center } = getNavigationLayout();
      this.setData({ height, center });
    },
  },

  methods: { goBack },
});
