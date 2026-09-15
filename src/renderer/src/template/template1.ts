const createTemplate1 = () => {
  return {
    version: 2,
    nodes: [
      { name: 'node01', des: 'nodedes01', symbolSize: 50, category: '类目0' },
      { name: 'node02', des: 'nodedes02', symbolSize: 50, category: '类目1' },
      { name: 'node03', des: 'nodedes3', symbolSize: 50, category: '类目2' },
      { name: 'node05', des: 'nodedes05', symbolSize: 50, category: '类目1' },
      { name: 'node04', des: 'nodedes04', symbolSize: 50, category: '类目3' }
    ],
    links: [
      { source: 'node01', target: 'node02', name: 'link01', des: 'link01des' },
      { source: 'node01', target: 'node05', name: 'link04', des: 'link05des' },
      { source: 'node01', target: 'node04', name: 'link03', des: 'link03des' },
      { source: 'node03', target: 'node02', name: 'link05', des: 'link05des' },
      { source: 'node04', target: 'node03', name: 'link02', des: 'link02des' },
      { source: 'node03', target: 'node05', name: 'link06', des: 'link06des' }
    ]
  }
}

export default createTemplate1
