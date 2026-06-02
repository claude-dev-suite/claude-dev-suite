// SPDX-License-Identifier: MIT
/**
 * Custom Skills Panel
 *
 * Displays and manages project-specific custom skills with create/edit/delete functionality.
 * Uses CustomSkillModal for creation (upload, write, AI chat) and CustomSkillEditorModal for editing.
 */

import { useState, useCallback } from 'react';
import { Button, Card, Badge, ErrorMessage, Spinner } from '../common';
import { PanelSection } from '../layout';
import { CustomSkillModal } from './CustomSkillModal';
import { CustomSkillEditorModal } from './CustomSkillEditorModal';
import { useCustomAgents } from '@/hooks/useCustomAgents';
import { useToast } from '@/hooks/useToast';
import type { CustomSkillDetail } from '@/types/custom-agents';

export interface CustomSkillsPanelProps {
  projectPath: string;
}

export function CustomSkillsPanel({ projectPath }: CustomSkillsPanelProps) {
  const toast = useToast();
  const {
    skills,
    skillsLoading,
    skillsError,
    refetchSkills,
    getSkill,
    createSkill,
    updateSkill,
    uploadSkill,
    validateSkillContent,
    deleteSkill,
  } = useCustomAgents(projectPath);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState<CustomSkillDetail | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);

  // Open editor for an existing skill
  const handleEdit = useCallback(async (skillId: string) => {
    setEditLoadingId(skillId);
    const detail = await getSkill(skillId);
    setEditLoadingId(null);

    if (detail) {
      setEditingSkill(detail);
      setShowEditorModal(true);
    }
  }, [getSkill]);

  // Open editor for AI-generated skill content
  const handleSkillGenerated = useCallback((content: string) => {
    const generatedSkill: CustomSkillDetail = {
      id: '__generated__',
      name: '',
      description: '',
      isCustom: true,
      filePath: '',
      content,
    };
    setEditingSkill(generatedSkill);
    setShowEditorModal(true);
  }, []);

  const handleDelete = async (skillId: string) => {
    if (!confirm(`Delete custom skill "${skillId}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(skillId);
    try {
      const result = await deleteSkill(skillId);
      if (!result.success) {
        toast.error(result.error || 'Failed to delete skill');
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (skillsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  if (skillsError) {
    return (
      <div className="p-4">
        <ErrorMessage error={skillsError} onRetry={refetchSkills} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelSection
        title="Custom Skills"
        description="Reusable skill definitions that can be referenced by custom agents"
        actions={
          <Button onClick={() => setShowCreateModal(true)} size="sm">
            Create Skill
          </Button>
        }
      >
        {skills.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="w-16 h-16 mx-auto text-surface-600 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <h3 className="text-lg font-medium text-surface-300 mb-2">
              No Custom Skills
            </h3>
            <p className="text-sm text-surface-400 mb-4">
              Create custom skills to share knowledge across your agents.
              <br />
              Reference them in agent frontmatter as <code className="text-primary-400">custom/skill-name</code>.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Your First Skill
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => (
              <Card key={skill.id} padding="md" className="hover:border-surface-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">
                        {skill.name}
                      </span>
                      <Badge variant="default" size="sm">
                        custom/{skill.id}
                      </Badge>
                    </div>
                    <p className="text-sm text-surface-400 mt-1 line-clamp-2">
                      {skill.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                      <span>{skill.filePath}</span>
                      {skill.modifiedAt && (
                        <span>
                          Modified {new Date(skill.modifiedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(skill.id)}
                      loading={editLoadingId === skill.id}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(skill.id)}
                      loading={deletingId === skill.id}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PanelSection>

      {/* Create Modal (3 modes: Upload, Write, AI Chat) */}
      <CustomSkillModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectPath={projectPath}
        existingSkills={skills.map((s) => s.id)}
        onCreateSkill={createSkill}
        onUploadSkill={uploadSkill}
        onValidate={validateSkillContent}
        onSkillGenerated={handleSkillGenerated}
      />

      {/* Editor Modal */}
      {editingSkill && (
        <CustomSkillEditorModal
          isOpen={showEditorModal}
          onClose={() => { setShowEditorModal(false); setEditingSkill(null); }}
          skill={editingSkill}
          onSave={(skillId, name, content, bypassWarnings) =>
            updateSkill(skillId, name, content, bypassWarnings)
          }
          onCreate={(name, content, bypassWarnings) =>
            createSkill(name, content, bypassWarnings)
          }
          onValidate={validateSkillContent}
        />
      )}
    </div>
  );
}
