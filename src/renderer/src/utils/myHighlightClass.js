import createOption from './myOption'

const highlight = (dataIndex, dataType) => {
  // 高亮，根据数据类型和位置来高亮
  chartInstance.dispatchAction({
    type: 'highlight',
    seriesIndex: 0,
    dataType: dataType,
    dataIndex: dataIndex
  })
}

const downplayByName = (name) => {
  // 解除节点高亮，有时节点无法知道自己的index
  chartInstance.dispatchAction({
    type: 'downplay',
    seriesIndex: 0,
    dataType: 'node',
    name: name
  })
}

const downplay = (dataIndex, dataType) => {
  // 解除高亮，根据数据类型和位置来解除
  chartInstance.dispatchAction({
    type: 'downplay',
    seriesIndex: 0,
    dataType: dataType,
    dataIndex: dataIndex
  })
}

const downplayAll = (highlightNodeList) => {
  // 解除全部节点的高亮
  for (let i = 0; i < highlightNodeList.length; i++) {
    downplayByName(highlightNodeList[i])
  }
}

const sendData = (formData, chart) =>{
  // 发送数据到后端
  if (chart === undefined) {
    fetch(`{{ url_for('
    XKnowledge.XKMainView
    ') }}`, {
        method: 'POST',
        body: formData // 将FormData对象作为请求体发送
      }
    )

  } else {
    fetch(`{{ url_for('
    XKnowledge.XKMainView
    ') }}`, {
        method: 'POST',
        body: formData // 将FormData对象作为请求体发送
      }
    ).
    then(response => {
      return response.json()
    }).then(data => {
      chart.setOption(createOption(data))
    })
  }
}

class HighlightClass {
  constructor() {
    this.highlightNodeList = [] // 记录旧的高亮节点
    this.highlightEdge = undefined
  }

  addNode(name, dataIndex) {
    const pos = this.highlightNodeList.indexOf(name)
    if (pos !== -1 && this.highlightNodeList.length !== 0) {
      // 当重复点击节点的时候，将节点高亮去掉，并且更新highlightNodeList
      if (this.highlightNodeList.length === 1) {
        downplay(dataIndex, 'node')
        this.highlightNodeList = []
      } else {
        downplay(dataIndex, 'node')
        this.highlightNodeList = [this.highlightNodeList[(pos + 1) % 2]]// 取pos对应的另一个节点
      }
    } else {
      if (this.highlightNodeList.length < 2) {
        // 点击第一个节点时，高亮点击的那个节点，点击第二个节点时，高亮新点击的节点
        this.highlightNodeList[this.highlightNodeList.length] = name
        highlight(dataIndex, 'node')
      } else {
        // 点击第三个节点时，将第一个节点高亮取消，并把第二个节点放到第一个位置上，为了后面的有向链接做准备
        downplayByName(this.highlightNodeList[0])
        highlight(dataIndex, 'node')
        this.highlightNodeList[0] = this.highlightNodeList[1]
        this.highlightNodeList[1] = name

      }
      console.log(this.highlightNodeList)
    }
  }

  addEdge(data, dataIndex) {
    if (this.highlightEdge === undefined) {
      // 如果边没有初始化，就初始化
      this.highlightEdge = { data: data, dataIndex: dataIndex }
      highlight(dataIndex, 'edge')
    } else {
      // 如果边初始化了，就将旧的边解除高亮
      downplay(this.highlightEdge.dataIndex, 'edge')
      if (this.highlightEdge.dataIndex !== dataIndex) {
        this.highlightEdge = { data: data, dataIndex: dataIndex }
        highlight(dataIndex, 'edge')
      } else {
        this.highlightEdge.dataIndex = undefined
      }
    }
  }

  reset() {
    downplayAll(this.highlightNodeList)
    this.highlightNodeList = []
    if (this.highlightEdge !== undefined) {
      downplay(this.highlightEdge.dataIndex, 'edge')
    }
    this.highlightEdge = undefined
  }

  resetNode() {
    downplayAll(this.highlightNodeList)
    this.highlightNodeList = []
  }

  resetEdge() {
    if (this.highlightEdge !== undefined) {
      downplay(this.highlightEdge.dataIndex, 'edge')
      this.highlightEdge = undefined
    }
  }
}

class HighlightClass {
  constructor() {
    this.highlightNodeList = [] // 记录旧的高亮节点
    this.highlightEdge = undefined
  }

  addNode(name, dataIndex) {
    const pos = this.highlightNodeList.indexOf(name)
    if (pos !== -1 && this.highlightNodeList.length !== 0) {
      // 当重复点击节点的时候，将节点高亮去掉，并且更新highlightNodeList
      if (this.highlightNodeList.length === 1) {
        downplay(dataIndex, 'node')
        this.highlightNodeList = []
      } else {
        downplay(dataIndex, 'node')
        this.highlightNodeList = [this.highlightNodeList[(pos + 1) % 2]]// 取pos对应的另一个节点
      }
    } else {
      if (this.highlightNodeList.length < 2) {
        // 点击第一个节点时，高亮点击的那个节点，点击第二个节点时，高亮新点击的节点
        this.highlightNodeList[this.highlightNodeList.length] = name
        highlight(dataIndex, 'node')
      } else {
        // 点击第三个节点时，将第一个节点高亮取消，并把第二个节点放到第一个位置上，为了后面的有向链接做准备
        downplayByName(this.highlightNodeList[0])
        highlight(dataIndex, 'node')
        this.highlightNodeList[0] = this.highlightNodeList[1]
        this.highlightNodeList[1] = name

      }
      console.log(this.highlightNodeList)
    }
  }

  addEdge(data, dataIndex) {
    if (this.highlightEdge === undefined) {
      // 如果边没有初始化，就初始化
      this.highlightEdge = { data: data, dataIndex: dataIndex }
      highlight(dataIndex, 'edge')
    } else {
      // 如果边初始化了，就将旧的边解除高亮
      downplay(this.highlightEdge.dataIndex, 'edge')
      if (this.highlightEdge.dataIndex !== dataIndex) {
        this.highlightEdge = { data: data, dataIndex: dataIndex }
        highlight(dataIndex, 'edge')
      } else {
        this.highlightEdge.dataIndex = undefined
      }
    }
  }

  reset() {
    downplayAll(this.highlightNodeList)
    this.highlightNodeList = []
    if (this.highlightEdge !== undefined) {
      downplay(this.highlightEdge.dataIndex, 'edge')
    }
    this.highlightEdge = undefined
  }

  resetNode() {
    downplayAll(this.highlightNodeList)
    this.highlightNodeList = []
  }

  resetEdge() {
    if (this.highlightEdge !== undefined) {
      downplay(this.highlightEdge.dataIndex, 'edge')
      this.highlightEdge = undefined
    }
  }
}

export default HighlightClass
