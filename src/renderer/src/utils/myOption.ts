const createOption = () => {
  return {
    // 图的标题
    title: {
      text: "test"
    },
    // 提示框的配置
    tooltip: {
      formatter: function (x) {
        return x.data.des
      }
    },
    // 工具箱
    toolbox: {
      // 显示工具箱
      show: true,
      feature: {
        mark: {
          show: true
        },
        // 保存为图片
        saveAsImage: {
          show: true
        }
      }
    },
    legend: [{
      // selectedMode: "single",
      data: ['类目1', '类目0', '类目3', '类目2']
    }],
    graphic: [
      {
        type: 'text',
        left: 'center',
        bottom: '5%',
        style: {
          fill: 'rgba(0,0,0,1)',
          text: 'By XKnowledge',
          font: 'bold 18px sans-serif'
        }
      }
    ],
    series: [{
      type: 'graph', // 类型:关系图
      layout: 'force', //图的布局，类型为力导图
      //symbolSize: 40, // 调整节点的大小
      roam: true, // 是否开启鼠标缩放和平移漫游。默认不开启。如果只想要开启缩放或者平移,可以设置成 "scale" 或者 "move"。设置成 true 为都开启
      // edgeSymbol: ["circle", "arrow"],
      //edgeSymbolSize: [2, 10],
      //edgeLabel: {
      //        textStyle: {
      //            fontSize: 20
      //        }
      //},
      force: {
        repulsion: 2500,
        edgeLength: [10, 50]
      },
      draggable: true, // 元素是否可以被拖动
      // 边的风格
      lineStyle: {
        width: 2,
        color: '#4b565b'
      },
      // 边上显示当前边的名称
      edgeLabel: {
        show: true,
        formatter: function (x) {
          return x.data.name
        }
      },
      // 节点上显示当前节点名称
      label: {
        show: true,
        textStyle: {}
      },
      // 高亮时节点外层增加黑色边缘
      emphasis: {
        disable: true,
        itemStyle: {
          borderColor: '#000',
          borderWidth: 2,
          borderType: 'solid'
        },
        lineStyle: {
          color: '#000',
          width: 5
        }
      },
      // 数据
      data: [
        {
          "name": "node01",
          "des": "nodedes01",
          "symbolSize": 70,
          "category": "\u7c7b\u76ee0"
        },
        {
          "name": "node02",
          "des": "nodedes02",
          "symbolSize": 50,
          "category": "\u7c7b\u76ee1"
        },
        {
          "name": "node03",
          "des": "nodedes3",
          "symbolSize": 50,
          "category": "\u7c7b\u76ee2"
        },
        {
          "name": "node05",
          "des": "nodedes05",
          "symbolSize": 50,
          "category": "\u7c7b\u76ee1"
        },
        {
          "name": "node04",
          "des": "nodedes04",
          "symbolSize": 50,
          "category": "\u7c7b\u76ee3"
        }
      ],
      links: [
        {
          "source": "node01",
          "target": "node02",
          "name": "link01",
          "des": "link01des"
        },
        {
          "source": "node01",
          "target": "node03",
          "name": "link02",
          "des": "link02des"
        },
        {
          "source": "node01",
          "target": "node05",
          "name": "link04",
          "des": "link05des"
        },
        {
          "source": "node01",
          "target": "node04",
          "name": "link03",
          "des": "link03des"
        }
      ],
      categories: [
        {
          "name": "\u7c7b\u76ee0"
        },
        {
          "name": "\u7c7b\u76ee3"
        },
        {
          "name": "\u7c7b\u76ee2"
        },
        {
          "name": "\u7c7b\u76ee1"
        }
      ]
    }]
  }
}

export default createOption
