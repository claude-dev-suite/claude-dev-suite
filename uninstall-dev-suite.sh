#!/bin/bash
# Dev-Suite Uninstaller
# Removes dev-suite from a project using the manifest file

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Options
DRY_RUN=false
FORCE=false
KEEP_BACKUPS=false
RESTORE_BACKUP=false
MCP_ONLY=false
CONFIG_ONLY=false
KEEP_CUSTOM=false

# Stats
FILES_REMOVED=0
DIRS_REMOVED=0
FILES_SKIPPED=0

# ============================================
# HELP
# ============================================
show_help() {
    echo -e "${BLUE}Dev-Suite Uninstaller${NC}"
    echo ""
    echo "Usage: ./uninstall-dev-suite.sh <project-path> [OPTIONS]"
    echo ""
    echo "Rimuove dev-suite da un progetto usando il manifest di installazione."
    echo ""
    echo -e "${CYAN}Opzioni:${NC}"
    echo "  --dry-run          Mostra cosa verrebbe eliminato senza eliminare"
    echo "  --force            Non chiedere conferme"
    echo "  --keep-backups     Mantieni la directory .dev-suite-backup"
    echo "  --keep-custom      Non eliminare file modificati dall'utente"
    echo "  --restore-backup   Ripristina file dal backup più recente"
    echo "  --mcp-only         Rimuovi solo MCP servers"
    echo "  --config-only      Rimuovi solo file di configurazione"
    echo ""
    echo "Esempio:"
    echo "  ./uninstall-dev-suite.sh /path/to/my-project"
    echo "  ./uninstall-dev-suite.sh /path/to/my-project --dry-run"
    echo "  ./uninstall-dev-suite.sh /path/to/my-project --restore-backup"
    exit 0
}

# ============================================
# CHECKSUM VERIFICATION
# ============================================
compute_checksum() {
    local file="$1"
    if [ -f "$file" ]; then
        if command -v sha256sum &> /dev/null; then
            sha256sum "$file" 2>/dev/null | cut -d' ' -f1
        elif command -v shasum &> /dev/null; then
            shasum -a 256 "$file" 2>/dev/null | cut -d' ' -f1
        else
            echo "no-checksum"
        fi
    else
        echo "no-checksum"
    fi
}

# ============================================
# REMOVE FILE
# ============================================
remove_file() {
    local file="$1"
    local expected_checksum="$2"
    local full_path="$TARGET_DIR/$file"

    if [ ! -f "$full_path" ]; then
        echo -e "  ${DIM}⊘ $file (non esiste)${NC}"
        return
    fi

    # Check if file was modified by user
    if [ -n "$expected_checksum" ] && [ "$expected_checksum" != "no-checksum" ] && [ "$KEEP_CUSTOM" = true ]; then
        local current_checksum=$(compute_checksum "$full_path")
        if [ "$current_checksum" != "$expected_checksum" ]; then
            echo -e "  ${YELLOW}⚠ $file (modificato dall'utente - saltato)${NC}"
            ((FILES_SKIPPED++)) || true
            return
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${CYAN}🗑 $file (dry-run)${NC}"
    else
        rm -f "$full_path"
        echo -e "  ${GREEN}✓${NC} $file"
        ((FILES_REMOVED++)) || true
    fi
}

# ============================================
# REMOVE DIRECTORY
# ============================================
remove_dir() {
    local dir="$1"
    local full_path="$TARGET_DIR/$dir"

    if [ ! -d "$full_path" ]; then
        echo -e "  ${DIM}⊘ $dir/ (non esiste)${NC}"
        return
    fi

    # Check if directory has user files
    if [ "$KEEP_CUSTOM" = true ]; then
        local non_tracked=$(find "$full_path" -type f 2>/dev/null | wc -l)
        if [ "$non_tracked" -gt 0 ]; then
            echo -e "  ${YELLOW}⚠ $dir/ (contiene file utente - saltato)${NC}"
            ((FILES_SKIPPED++)) || true
            return
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${CYAN}🗑 $dir/ (dry-run)${NC}"
    else
        rm -rf "$full_path"
        echo -e "  ${GREEN}✓${NC} $dir/"
        ((DIRS_REMOVED++)) || true
    fi
}

# ============================================
# RESTORE FROM BACKUP
# ============================================
restore_from_backup() {
    local backup_dir="$1"
    local full_backup="$TARGET_DIR/$backup_dir"

    if [ ! -d "$full_backup" ]; then
        echo -e "${RED}Backup non trovato: $backup_dir${NC}"
        return 1
    fi

    echo -e "${CYAN}Ripristino backup da: $backup_dir${NC}"
    echo ""

    for file in "$full_backup"/*; do
        if [ -e "$file" ]; then
            local filename=$(basename "$file")
            if [ "$DRY_RUN" = true ]; then
                echo -e "  ${CYAN}↩ $filename (dry-run)${NC}"
            else
                cp -r "$file" "$TARGET_DIR/"
                echo -e "  ${GREEN}✓${NC} Ripristinato: $filename"
            fi
        fi
    done

    echo ""
}

# ============================================
# PARSE ARGUMENTS
# ============================================
TARGET_DIR="$1"

if [ -z "$TARGET_DIR" ] || [ "$TARGET_DIR" = "--help" ] || [ "$TARGET_DIR" = "-h" ]; then
    show_help
fi

# Convert to absolute path
if [[ "$TARGET_DIR" != /* ]]; then
    TARGET_DIR="$(pwd)/$TARGET_DIR"
fi

shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --keep-backups)
            KEEP_BACKUPS=true
            shift
            ;;
        --keep-custom)
            KEEP_CUSTOM=true
            shift
            ;;
        --restore-backup)
            RESTORE_BACKUP=true
            shift
            ;;
        --mcp-only)
            MCP_ONLY=true
            shift
            ;;
        --config-only)
            CONFIG_ONLY=true
            shift
            ;;
        *)
            echo -e "${YELLOW}Warning: Unknown argument: $1${NC}"
            shift
            ;;
    esac
done

# ============================================
# VALIDATE
# ============================================
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}Errore: Directory non trovata: $TARGET_DIR${NC}"
    exit 1
fi

MANIFEST_FILE="$TARGET_DIR/.dev-suite-manifest.json"

if [ ! -f "$MANIFEST_FILE" ]; then
    echo -e "${RED}Errore: Manifest non trovato: .dev-suite-manifest.json${NC}"
    echo ""
    echo -e "${DIM}Il manifest viene creato durante l'installazione di dev-suite.${NC}"
    echo -e "${DIM}Se il progetto è stato configurato con una versione precedente,${NC}"
    echo -e "${DIM}puoi rimuovere manualmente i file dev-suite.${NC}"
    exit 1
fi

# ============================================
# READ MANIFEST
# ============================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         ${BOLD}Dev-Suite Uninstaller${NC}${BLUE}                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Progetto: ${BOLD}$TARGET_DIR${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⚠ Modalità DRY-RUN: nessun file verrà eliminato${NC}"
    echo ""
fi

# Parse manifest with jq if available, otherwise use grep/sed
if command -v jq &> /dev/null; then
    INSTALLED_AT=$(jq -r '.installed_at // "unknown"' "$MANIFEST_FILE")
    BACKUP_LOCATION=$(jq -r '.backups.location // ""' "$MANIFEST_FILE")
else
    INSTALLED_AT=$(grep -o '"installed_at"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | sed 's/.*"\([^"]*\)"$/\1/')
    BACKUP_LOCATION=$(grep -o '"location"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | sed 's/.*"\([^"]*\)"$/\1/')
fi

echo -e "Installato: ${DIM}$INSTALLED_AT${NC}"
[ -n "$BACKUP_LOCATION" ] && echo -e "Backup: ${DIM}$BACKUP_LOCATION${NC}"
echo ""

# ============================================
# CONFIRMATION
# ============================================
if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
    echo -e "${YELLOW}Questa operazione rimuoverà dev-suite dal progetto.${NC}"
    echo ""
    read -p "Continuare? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Operazione annullata${NC}"
        exit 1
    fi
    echo ""
fi

# ============================================
# RESTORE BACKUP (if requested)
# ============================================
if [ "$RESTORE_BACKUP" = true ] && [ -n "$BACKUP_LOCATION" ]; then
    restore_from_backup "$BACKUP_LOCATION"
fi

# ============================================
# REMOVE MCP SERVERS
# ============================================
if [ "$CONFIG_ONLY" = false ]; then
    echo -e "${CYAN}Rimozione MCP Servers...${NC}"

    if command -v jq &> /dev/null; then
        while IFS= read -r server_path; do
            [ -z "$server_path" ] && continue
            remove_dir "$server_path"
        done < <(jq -r '.actions.mcp_servers_installed[]?.path // empty' "$MANIFEST_FILE" 2>/dev/null)
    else
        # Fallback: remove .mcp-servers directory
        if [ -d "$TARGET_DIR/.mcp-servers" ]; then
            remove_dir ".mcp-servers"
        fi
    fi

    # Remove parent .mcp-servers if empty
    if [ -d "$TARGET_DIR/.mcp-servers" ] && [ -z "$(ls -A "$TARGET_DIR/.mcp-servers" 2>/dev/null)" ]; then
        remove_dir ".mcp-servers"
    fi

    echo ""
fi

# ============================================
# REMOVE COPIED FILES
# ============================================
if [ "$MCP_ONLY" = false ]; then
    echo -e "${CYAN}Rimozione file copiati...${NC}"

    if command -v jq &> /dev/null; then
        while IFS= read -r file_path; do
            [ -z "$file_path" ] && continue
            remove_file "$file_path" ""
        done < <(jq -r '.actions.files_copied[]?.path // empty' "$MANIFEST_FILE" 2>/dev/null)
    fi

    echo ""
fi

# ============================================
# REMOVE CREATED FILES
# ============================================
if [ "$MCP_ONLY" = false ]; then
    echo -e "${CYAN}Rimozione file di configurazione...${NC}"

    if command -v jq &> /dev/null; then
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            file_path=$(echo "$line" | jq -r '.path // empty')
            checksum=$(echo "$line" | jq -r '.checksum // empty')
            [ -z "$file_path" ] && continue
            remove_file "$file_path" "$checksum"
        done < <(jq -c '.actions.files_created[]?' "$MANIFEST_FILE" 2>/dev/null)
    else
        # Fallback: remove known files
        for file in ".mcp.json" ".dev-suite.json" "CLAUDE.md"; do
            remove_file "$file" ""
        done
    fi

    echo ""
fi

# ============================================
# REMOVE CREATED DIRECTORIES (reverse order)
# ============================================
if [ "$MCP_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
    echo -e "${CYAN}Rimozione directory...${NC}"

    if command -v jq &> /dev/null; then
        # Get directories in reverse order (deepest first)
        dirs=$(jq -r '.actions.directories_created[]? // empty' "$MANIFEST_FILE" 2>/dev/null | sort -r)
        while IFS= read -r dir_path; do
            [ -z "$dir_path" ] && continue
            # Only remove if empty
            if [ -d "$TARGET_DIR/$dir_path" ] && [ -z "$(ls -A "$TARGET_DIR/$dir_path" 2>/dev/null)" ]; then
                remove_dir "$dir_path"
            elif [ -d "$TARGET_DIR/$dir_path" ]; then
                echo -e "  ${YELLOW}⚠ $dir_path/ (non vuota - saltata)${NC}"
            fi
        done <<< "$dirs"
    else
        # Fallback: try to remove known directories
        for dir in ".claude/skills" ".claude/agents" ".claude/commands" ".claude"; do
            if [ -d "$TARGET_DIR/$dir" ] && [ -z "$(ls -A "$TARGET_DIR/$dir" 2>/dev/null)" ]; then
                remove_dir "$dir"
            fi
        done
    fi

    echo ""
fi

# ============================================
# REMOVE MANIFEST
# ============================================
echo -e "${CYAN}Rimozione manifest...${NC}"
remove_file ".dev-suite-manifest.json" ""
echo ""

# ============================================
# REMOVE BACKUPS (if not keeping)
# ============================================
if [ "$KEEP_BACKUPS" = false ] && [ -d "$TARGET_DIR/.dev-suite-backup" ]; then
    echo -e "${CYAN}Rimozione backup...${NC}"
    remove_dir ".dev-suite-backup"
    echo ""
fi

# ============================================
# SUMMARY
# ============================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Disinstallazione completata                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Modalità DRY-RUN: nessuna modifica effettuata${NC}"
else
    echo -e "  File rimossi:      ${BOLD}$FILES_REMOVED${NC}"
    echo -e "  Directory rimosse: ${BOLD}$DIRS_REMOVED${NC}"
    [ $FILES_SKIPPED -gt 0 ] && echo -e "  File saltati:      ${BOLD}$FILES_SKIPPED${NC}"
fi
echo ""

if [ "$RESTORE_BACKUP" = true ] && [ -n "$BACKUP_LOCATION" ]; then
    echo -e "${GREEN}I file sono stati ripristinati dal backup.${NC}"
    echo ""
fi

echo -e "${DIM}Dev-suite è stato rimosso dal progetto.${NC}"
echo ""
