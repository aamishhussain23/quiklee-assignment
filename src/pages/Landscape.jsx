import { Card, CardHead, PageHeader } from '../components/ui.jsx';
import { toolTypes } from '../data/landscape.js';

export default function Landscape() {
  return (
    <>
      <PageHeader title="Landscape" desc="The tools an e-commerce order passes through, and what each one owns." />

      <Card>
        <CardHead title="Five kinds of tool" desc="In the order an order meets them." />
        <div className="toolList">
          {toolTypes.map((tool, index) => (
            <div className={`tool ${tool.tone}`} key={tool.id}>
              <div className="toolIndex">{index + 1}</div>
              <div className="toolBody">
                <h4>{tool.name}</h4>
                <p className="toolLine">{tool.oneLine}</p>
                <dl>
                  <dt>Owns</dt>
                  <dd>{tool.owns}</dd>
                  <dt>In the market</dt>
                  <dd>{tool.players}</dd>
                </dl>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
