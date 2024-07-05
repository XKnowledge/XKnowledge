function createOption(jsonData) {
    return {
        // 图的标题
        title: {
            text: jsonData.title
        },
        // 提示框的配置
        tooltip: {
            formatter: function (x) {
                return x.data.des;
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
            data: jsonData.categories.map(function (a) {
                return a.name;
            })
        }],
        graphic: [
            {
                type: "text",
                left: "center",
                bottom: "5%",
                style: {
                    fill: "rgba(0,0,0,1)",
                    text: "By XKnowledge",
                    font: "bold 18px sans-serif"
                }
            }
        ],
        series: [{
            type: "graph", // 类型:关系图
            layout: "force", //图的布局，类型为力导图
            //symbolSize: 40, // 调整节点的大小
            roam: true, // 是否开启鼠标缩放和平移漫游。默认不开启。如果只想要开启缩放或者平移,可以设置成 "scale" 或者 "move"。设置成 true 为都开启
            // edgeSymbol: ["circle", "arrow"],
            //edgeSymbolSize: [2, 10],
            //edgeLabel: {
            //    normal: {
            //        textStyle: {
            //            fontSize: 20
            //        }
            //    }
            //},
            force: {
                repulsion: 2500,
                edgeLength: [10, 50]
            },
            draggable: true, // 元素是否可以被拖动
            // 边的风格
            lineStyle: {
              width: 2,
              color: "#4b565b",
            },
            // 边上显示当前边的名称
            edgeLabel: {
              show: true,
              formatter: function (x) {
                return x.data.name;
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
                    borderColor: "#000",
                    borderWidth: 2,
                    borderType: "solid"
                },
                lineStyle: {
                    color: "#000",
                    width: 5,
                }
            },
            // 数据
            data: jsonData.data,
            links: jsonData.links,
            categories: jsonData.categories,
        }]
    };
}
