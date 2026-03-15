// SPDX-License-Identifier: MIT
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type CodeGenTechnology = 'openapi' | 'asyncapi' | 'typespec' | 'protobuf' | 'bpmn';

export type CodeGenTargetLanguage =
  | 'typescript-express' | 'typescript-fastify' | 'typescript-nestjs' | 'typescript-koa'
  | 'java-spring' | 'python-fastapi' | 'python-flask' | 'go-gin' | 'go-echo';

export interface CodeGenComponent {
  id: string;
  label: string;
  enabled: boolean;
}

export interface ValidationResult {
  valid: boolean;
  technology: CodeGenTechnology | null;
  version: string | null;
  errors: string[];
  warnings: string[];
  summary: {
    title?: string;
    endpoints?: number;
    models?: number;
    channels?: number;
    services?: number;
    messages?: number;
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export type CodeGenStep = 1 | 2 | 3 | 4 | 5;

interface CodeGenState {
  currentStep: CodeGenStep;
  technology: CodeGenTechnology | null;
  uploadedFile: { name: string; content: string; size: number } | null;
  validation: ValidationResult | null;
  targetLanguage: CodeGenTargetLanguage | null;
  outputDir: string;
  components: CodeGenComponent[];
  generatedFiles: GeneratedFile[];
  jobStatus: 'idle' | 'validating' | 'generating' | 'refining' | 'completed' | 'failed';
  consoleOutput: string[];
  error: string | null;

  setStep: (step: CodeGenStep) => void;
  setTechnology: (tech: CodeGenTechnology) => void;
  setUploadedFile: (file: { name: string; content: string; size: number } | null) => void;
  setValidation: (v: ValidationResult | null) => void;
  setTargetLanguage: (lang: CodeGenTargetLanguage) => void;
  setOutputDir: (dir: string) => void;
  setComponents: (components: CodeGenComponent[]) => void;
  toggleComponent: (id: string) => void;
  setGeneratedFiles: (files: GeneratedFile[]) => void;
  setJobStatus: (status: CodeGenState['jobStatus']) => void;
  addConsoleOutput: (line: string) => void;
  clearConsoleOutput: () => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 1 as CodeGenStep,
  technology: null as CodeGenTechnology | null,
  uploadedFile: null as { name: string; content: string; size: number } | null,
  validation: null as ValidationResult | null,
  targetLanguage: null as CodeGenTargetLanguage | null,
  outputDir: 'src/generated',
  components: [] as CodeGenComponent[],
  generatedFiles: [] as GeneratedFile[],
  jobStatus: 'idle' as CodeGenState['jobStatus'],
  consoleOutput: [] as string[],
  error: null as string | null,
};

export const useCodeGenStore = create<CodeGenState>()(
  devtools(
    (set) => ({
      ...initialState,

      setStep: (step) => set({ currentStep: step }, false, 'setStep'),
      setTechnology: (tech) => set({ technology: tech }, false, 'setTechnology'),
      setUploadedFile: (file) => set({ uploadedFile: file }, false, 'setUploadedFile'),
      setValidation: (v) => set({ validation: v }, false, 'setValidation'),
      setTargetLanguage: (lang) => set({ targetLanguage: lang }, false, 'setTargetLanguage'),
      setOutputDir: (dir) => set({ outputDir: dir }, false, 'setOutputDir'),
      setComponents: (components) => set({ components }, false, 'setComponents'),
      toggleComponent: (id) =>
        set(
          (state) => ({
            components: state.components.map((c) =>
              c.id === id ? { ...c, enabled: !c.enabled } : c
            ),
          }),
          false,
          'toggleComponent'
        ),
      setGeneratedFiles: (files) => set({ generatedFiles: files }, false, 'setGeneratedFiles'),
      setJobStatus: (status) => set({ jobStatus: status }, false, 'setJobStatus'),
      addConsoleOutput: (line) =>
        set((state) => ({ consoleOutput: [...state.consoleOutput, line] }), false, 'addConsoleOutput'),
      clearConsoleOutput: () => set({ consoleOutput: [] }, false, 'clearConsoleOutput'),
      setError: (error) => set({ error }, false, 'setError'),
      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'CodeGenStore' }
  )
);
