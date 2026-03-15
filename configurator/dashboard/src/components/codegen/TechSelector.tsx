// SPDX-License-Identifier: MIT
import clsx from 'clsx';
import { useCodeGenStore } from '../../stores/codegen.store';
import type { CodeGenTechnology } from '../../stores/codegen.store';

const TECHNOLOGIES: Array<{
  id: CodeGenTechnology;
  label: string;
  description: string;
  formats: string;
}> = [
  {
    id: 'openapi',
    label: 'OpenAPI',
    description: 'REST API specification (Swagger)',
    formats: '.yaml, .yml, .json',
  },
  {
    id: 'asyncapi',
    label: 'AsyncAPI',
    description: 'Event-driven API specification',
    formats: '.yaml, .yml, .json',
  },
  {
    id: 'typespec',
    label: 'TypeSpec',
    description: 'Microsoft API description language',
    formats: '.tsp',
  },
  {
    id: 'protobuf',
    label: 'Protocol Buffers',
    description: 'gRPC service definitions',
    formats: '.proto',
  },
  {
    id: 'bpmn',
    label: 'BPMN',
    description: 'Business process diagrams',
    formats: '.bpmn, .xml',
  },
];

export function TechSelector() {
  const technology = useCodeGenStore((s) => s.technology);
  const setTechnology = useCodeGenStore((s) => s.setTechnology);
  const setStep = useCodeGenStore((s) => s.setStep);

  const handleSelect = (tech: CodeGenTechnology) => {
    setTechnology(tech);
    setStep(2);
  };

  return (
    <div className="space-y-4">
      <p className="text-surface-300">
        Select the specification format you want to generate code from, or upload a file and let us detect it.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TECHNOLOGIES.map((tech) => (
          <button
            key={tech.id}
            onClick={() => handleSelect(tech.id)}
            className={clsx(
              'flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left',
              technology === tech.id
                ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                : 'border-surface-600 bg-surface-800 hover:border-surface-500 hover:bg-surface-700/50'
            )}
          >
            <span className="text-sm font-semibold text-white">{tech.label}</span>
            <span className="text-xs text-surface-400">{tech.description}</span>
            <span className="text-xs text-surface-500 font-mono">{tech.formats}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
