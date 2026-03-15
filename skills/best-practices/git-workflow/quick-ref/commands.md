# Git Commands Quick Reference

> **Knowledge Base:** Read `knowledge/git/commands.md` for complete documentation.

## Basic Commands

```bash
# Initialize & Clone
git init
git clone <url>
git clone --depth 1 <url>  # Shallow clone

# Status & Diff
git status
git diff                   # Unstaged changes
git diff --staged          # Staged changes
git diff HEAD~2            # Last 2 commits

# Add & Commit
git add .
git add -p                 # Interactive staging
git commit -m "message"
git commit --amend         # Modify last commit

# Branches
git branch                 # List local branches
git branch -a              # Include remote
git branch <name>          # Create branch
git branch -d <name>       # Delete branch
git branch -m <old> <new>  # Rename branch
git checkout <branch>
git checkout -b <branch>   # Create and switch
git switch <branch>        # Switch (newer)
git switch -c <branch>     # Create and switch
```

## Remote Operations

```bash
# Remotes
git remote -v
git remote add <name> <url>
git remote remove <name>

# Fetch & Pull
git fetch
git fetch --all
git pull
git pull --rebase
git pull origin main

# Push
git push
git push -u origin <branch>  # Set upstream
git push --force-with-lease  # Safe force push
git push origin --delete <branch>  # Delete remote branch
```

## Merging & Rebasing

```bash
# Merge
git merge <branch>
git merge --no-ff <branch>  # Create merge commit
git merge --squash <branch>  # Squash commits
git merge --abort

# Rebase
git rebase main
git rebase -i HEAD~3        # Interactive rebase
git rebase --abort
git rebase --continue

# Cherry-pick
git cherry-pick <commit>
git cherry-pick -n <commit>  # No commit
```

## Stash

```bash
git stash
git stash save "message"
git stash list
git stash pop               # Apply and remove
git stash apply             # Apply and keep
git stash drop              # Remove
git stash clear             # Remove all
git stash branch <branch>   # Create branch from stash
```

## History & Logs

```bash
git log
git log --oneline
git log --graph --oneline --all
git log -p                  # Show patches
git log --author="name"
git log --since="2 weeks ago"
git log -- <file>           # File history

git show <commit>
git blame <file>
git reflog                  # Reference log
```

## Reset & Revert

```bash
# Reset (move HEAD)
git reset --soft HEAD~1     # Keep changes staged
git reset --mixed HEAD~1    # Keep changes unstaged (default)
git reset --hard HEAD~1     # Discard changes

# Revert (create new commit)
git revert <commit>
git revert HEAD~3..HEAD     # Revert range

# Restore files
git restore <file>          # Discard changes
git restore --staged <file> # Unstage
git checkout -- <file>      # Old way
```

## Tags

```bash
git tag                     # List tags
git tag v1.0.0              # Lightweight tag
git tag -a v1.0.0 -m "msg"  # Annotated tag
git push origin v1.0.0      # Push tag
git push origin --tags      # Push all tags
git tag -d v1.0.0           # Delete local
git push origin :v1.0.0     # Delete remote
```

## Worktree

```bash
git worktree list
git worktree add ../feature-branch feature
git worktree remove ../feature-branch
```

## Submodules

```bash
git submodule add <url> <path>
git submodule init
git submodule update
git submodule update --init --recursive
git clone --recurse-submodules <url>
```

## Configuration

```bash
# Set user info
git config --global user.name "Name"
git config --global user.email "email@example.com"

# Aliases
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.lg "log --oneline --graph"

# View config
git config --list
git config --global --list
```

## Useful Aliases

```bash
# In ~/.gitconfig
[alias]
  co = checkout
  br = branch
  ci = commit
  st = status
  lg = log --oneline --graph --all
  undo = reset --soft HEAD~1
  amend = commit --amend --no-edit
  unstage = reset HEAD --
  last = log -1 HEAD
  wip = !git add -A && git commit -m "WIP"
```

**Official docs:** https://git-scm.com/docs
