import * as path from 'path';
import { RecursiveGraphAnalyzer } from '../../../src/analysis/RecursiveGraphAnalyzer';

function fixture(rel: string) {
  return path.resolve(__dirname, '../../fixtures/recursive', rel);
}

describe('RecursiveGraphAnalyzer (experimental)', () => {
  it('traverses component -> child component via template tag and injected services recursively', () => {
    const analyzer = new RecursiveGraphAnalyzer();
    const result = analyzer.analyze({
      roots: [{ sourceFilePath: fixture('root.component.ts'), componentClassName: 'RootComponent' }],
      maxDepth: 5,
      maxNodes: 20
    });

    const rootNode = result.nodes.find(n => n.className === 'RootComponent');
    const childNode = result.nodes.find(n => n.className === 'ChildComponent');
    const serviceANode = result.nodes.find(n => n.className === 'ServiceA');
    const serviceBNode = result.nodes.find(n => n.className === 'ServiceB');

    expect(rootNode).toBeTruthy();
    expect(childNode).toBeTruthy();
    expect(serviceANode).toBeTruthy();
    expect(serviceBNode).toBeTruthy();

    // Edges should include template-tag and injects reasons
    const templateEdge = result.edges.find(e => e.reason === 'template-tag' && e.to.className === 'ChildComponent');
    expect(templateEdge).toBeTruthy();
    const injectEdgeA = result.edges.find(e => e.reason === 'injects' && e.to.className === 'ServiceA');
    const injectEdgeB = result.edges.find(e => e.reason === 'injects' && e.to.className === 'ServiceB');
    expect(injectEdgeA).toBeTruthy();
    expect(injectEdgeB).toBeTruthy();
  });
});

