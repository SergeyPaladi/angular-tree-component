import { Injectable } from '@angular/core';
import { observable, computed, action, autorun, reaction } from 'mobx';
import { TreeModel } from './tree.model';
import { TREE_EVENTS } from '../constants/events';

const Y_OFFSET = 300; // Extra pixels outside the viewport, in each direction, to render nodes in
const Y_EPSILON = 50; // Minimum pixel change required to recalculate the rendered nodes

@Injectable()
export class TreeVirtualScroll {
  private _dispose: any;

  @observable yBlocks = 0;
  @observable x = 0;
  @observable viewportHeight = null;
  viewport = null;

  @computed get y() {
    return this.yBlocks * Y_EPSILON;
  }

  isEnabled() {
    return this.treeModel.options.useVirtualScroll;
  }

  @computed get totalHeight() {
    return this.treeModel.virtualRoot ? this.treeModel.virtualRoot.height : 0;
  }

  @computed.struct get viewportNodes() {
    return this.getViewportNodes(this.treeModel.roots);
  }

  @computed get translateY() {
    return this.viewportNodes[0] ? this.viewportNodes[0].position + this.y : 0;
  }

  constructor(private treeModel: TreeModel) {
    treeModel.virtualScroll = this;
    this._dispose = autorun(() => this.fixScroll());
  }

  init() {
    const fn = this.recalcPositions.bind(this);

    fn();
    reaction(() => this.treeModel.roots, fn);
    reaction(() => this.treeModel.expandedNodeIds, fn);
    reaction(() => this.treeModel.hiddenNodeIds, fn);
    this.treeModel.subscribe(TREE_EVENTS.onLoadChildren, fn);
  }

  recalcPositions() {
    this.treeModel.virtualRoot.height = this._getPositionAfter(this.treeModel.getVisibleRoots(), 0);
  }

  private _getPositionAfter(nodes, startPos) {
    let position = startPos;

    nodes.forEach((node) => {
      node.position = position;
      position = this._getPositionAfterNode(node, position);
    });
    return position;
  }

  private _getPositionAfterNode(node, startPos) {
    let position = node.getSelfHeight() + startPos;

    if (node.children && node.isExpanded) { // TBD: consider loading component as well
      position = this._getPositionAfter(node.visibleChildren, position);
    }
    node.height = position - startPos;
    return position;
  }


  clear() {
    this._dispose();
  }

  @action setNewScroll({ viewport }) {
    Object.assign(this, {
      viewport,
      x: viewport.scrollLeft,
      yBlocks: Math.round(viewport.scrollTop / Y_EPSILON),
      viewportHeight: viewport.getBoundingClientRect().height
    });
  }

  @action scrollIntoView(node, force, scrollToMiddle = true) {
    if (force || // force scroll to node
      node.position < this.y || // node is above viewport
      node.position + node.getSelfHeight() > this.y + this.viewportHeight) { // node is below viewport
      this.viewport.scrollTop = scrollToMiddle ?
        node.position - this.viewportHeight / 2 : // scroll to middle
        node.position; // scroll to start

      this.yBlocks = Math.floor(this.viewport.scrollTop / Y_EPSILON);
    }
  }

  getViewportNodes(nodes) {
    if (!this.isEnabled()) {
      return nodes;
    }
    if (!this.viewportHeight || !nodes || !nodes.length) return [];

    const visibleNodes = nodes.filter((node) => !node.isHidden);

    if (!visibleNodes.length) return [];

    // Search for first node in the viewport using binary search
    // Look for first node that starts after the beginning of the viewport (with buffer)
    // Or that ends after the beginning of the viewport
    const firstIndex = binarySearch(visibleNodes, (node) => {
      return (node.position + Y_OFFSET > this.y) ||
             (node.position + node.height > this.y);
    });

    // Search for last node in the viewport using binary search
    // Look for first node that starts after the end of the viewport (with buffer)
    const lastIndex = binarySearch(visibleNodes, (node) => {
      return node.position - Y_OFFSET > this.y + this.viewportHeight;
    }, firstIndex);

    const viewportNodes = [];
    for (let i = firstIndex; i <= lastIndex; i++) {
      viewportNodes.push(visibleNodes[i]);
    }

    return viewportNodes;
  }

  fixScroll() {
    const maxY = Math.max(0, this.totalHeight - this.viewportHeight);

    if (this.y < 0) this.yBlocks = 0;
    if (this.y > maxY) this.yBlocks = maxY / Y_EPSILON;
  }
}

function binarySearch(nodes, condition, firstIndex = 0) {
  let index = firstIndex;
  let toIndex = nodes.length - 1;

  while (index !== toIndex) {
    let midIndex = Math.floor((index + toIndex) / 2);

    if (condition(nodes[midIndex])) {
      toIndex = midIndex;
    }
    else {
      if (index === midIndex) index = toIndex;
      else index = midIndex;
    }
  }
  return index;
}
