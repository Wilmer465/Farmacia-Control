# Instalación de skills de terceros y arquitectura `.agents/skills/`

## Contexto verificado (2026-10-05)

- **CLI:** `npx skills` (vercel-labs/skills, 33.2K★). Flags confirmados en su README: `-g/--global`, `-a/--agent <agente>`, `-s/--skill <nombre>` (repetible, `'*'` = todas), `-l/--list` (listar sin instalar), `--copy`, `-y/--yes`, `--all`.
- **Rutas oficiales para Kilo Code:** proyecto → `.agents/skills/`; global → `~/.kilo/skills/`; flag de agente → `kilo`. **La arquitectura solicitada coincide exactamente con la ruta de proyecto de Kilo.**
- **Ámbito:** proyecto (default) = versionado con el repo, compartido con el equipo; global (`-g`) = solo este usuario.
- **Método de instalación:** symlink (default) o `--copy`. En Windows los symlinks requieren Developer Mode y OneDrive sincroniza mal los symlinks → **usar `--copy`** en este entorno.
- **Layouts con categorías:** el CLI descubre skills hasta 3 niveles de profundidad (`skills/<categoría>/<nombre>/SKILL.md`, 1-2 niveles de categoría) — las subcarpetas son un layout de primera clase.
- **Estado actual:** 8 skills PROPIA en `.skills/` (Kilo las carga desde ahí); 3 globales en `~/.agents/skills/` (`find-skills`, `frontend-design`, `supabase-postgres-best-practices`).
- **Reputación:** obra/superpowers 295.6K★ (auditorías Socket/Snyk/AgentTrust pasadas), wshobson/agents 40.2K★, vercel-labs 33.2K★, prisma/supabase/shadcn oficiales, currents-dev 390★; **agents-inc 24★ y gohypergiant 24★ = baja reputación, revisar contenido antes de confiar**.
- El CLI es JavaScript puro (npx): **no** aplica el problema de ABI de better-sqlite3 de AGENTS.md.

## Decisiones resueltas

1. Ámbito **proyecto** con `-a kilo` explícito en cada comando (evita instalar en otros agentes que el CLI detecte).
2. **Pre-flight con `--list`** (solo lectura) para confirmar nombres exactos en repos multi-skill antes de instalar.
3. Deduplicar la lista cruda (16 comandos con repeticiones → 14 instalaciones únicas).
4. **Colisión `audit-security`:** omitir el de agents-inc; conservar el PROPIA en `.skills/audit-security` (mismo nombre → ambigüedad en descubrimiento).
5. **`--copy`** en lugar de symlink (Windows + OneDrive).
6. Prisma: solo las 4 pedidas con `--skill` explícito (el repo tiene ~10); son conocimiento de referencia — el proyecto NO usa Prisma (better-sqlite3 + SQL crudo).
7. Organización por categorías post-instalación (layout de catálogo soportado por el CLI); verificar descubrimiento anidado en sesión nueva de Kilo.
8. `find-skills` ya instalada globalmente y es una meta-skill de descubrimiento → omitir su reinstalación.
9. **gohypergiant = selectivo:** solo `accelint-react-best-practices`, `accelint-react-testing`, `accelint-ts-best-practices`, `accelint-security-best-practices` (relevantes para este stack; el resto de las 23 se solapa con vercel-labs/wshobson).
10. `.agents/skills/` **sí se versiona en git** (es el propósito del ámbito proyecto; `.gitignore` no lo excluye).

## Pre-flight (solo lectura — ejecutar primero)

```powershell
npx skills add agents-inc/skills --list
npx skills add wshobson/agents --list
npx skills add gohypergiant/agent-skills --list
npx skills add supabase/agent-skills --list
npx skills add prisma/skills --list
```
Ajustar nombres según la salida antes de instalar. Opcional: `$env:DISABLE_TELEMETRY = "1"`.

## Instalación (desde la raíz del repo; añadir `-a kilo -y --copy` a cada comando)

Alta reputación:
1. `npx skills add mattpocock/skills --skill tdd` → raíz
2. `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` → `design-system/`
3. `npx skills add https://github.com/obra/superpowers --skill verification-before-completion` → raíz
4. `npx skills add https://github.com/obra/superpowers --skill systematic-debugging` → `debugging/`
5. `npx skills add https://github.com/currents-dev/playwright-best-practices-skill --skill playwright-best-practices` → `playwright/` (incluye referencia de **testing de Electron**)
6. `npx skills add https://github.com/shadcn-ui/ui --skill shadcn` → `design-system/`

Prisma (4):
7. `npx skills add prisma/skills --skill prisma-database-setup --skill prisma-client-api --skill prisma-cli --skill prisma-postgres` → `prisma/`

agents-inc (6; omitir `audit-security` por colisión):
8. `npx skills add agents-inc/skills --skill desktop-framework-electron --skill desktop-security-electron --skill desktop-ipc-electron --skill desktop-testing-electron --skill security-best-practices --skill electron-security` → `electron/` (las 4 desktop-*) y `security/` (las 2 de seguridad)

wshobson (2):
9. `npx skills add wshobson/agents --skill typescript-advanced-types --skill tailwind-design-system` → `typescript/` y `design-system/`

supabase (2):
10. `npx skills add supabase/agent-skills --skill supabase --skill supabase-postgres-best-practices` → `supabase/` (`supabase-postgres-best-practices` ya existe global — la copia de proyecto es para el equipo; la duplicación es inofensiva)

gohypergiant (4 selectivas):
11. `npx skills add gohypergiant/agent-skills --skill accelint-react-best-practices --skill accelint-react-testing --skill accelint-ts-best-practices --skill accelint-security-best-practices` → `react/` (2), `typescript/` (1), `security/` (1)

## Organización por categorías (tras instalar, plano → subcarpetas)

- `electron/`: desktop-framework-electron, desktop-security-electron, desktop-ipc-electron, desktop-testing-electron
- `react/`: accelint-react-best-practices, accelint-react-testing
- `typescript/`: typescript-advanced-types, accelint-ts-best-practices
- `prisma/`: las 4 skills prisma
- `playwright/`: playwright-best-practices
- `design-system/`: web-design-guidelines, tailwind-design-system, shadcn
- `security/`: security-best-practices, electron-security, accelint-security-best-practices
- `debugging/`: systematic-debugging
- `supabase/`: supabase, supabase-postgres-best-practices
- raíz: tdd, verification-before-completion

## Validación

- `npx skills list` (alias `ls`) y `npx skills ls -a kilo` — lista las instaladas.
- Cada directorio de skill contiene `SKILL.md` con frontmatter `name` + `description`.
- **Sesión nueva de Kilo:** las skills nuevas aparecen en `available_skills`, incluidas las anidadas por categoría. Si no: aplanar y usar README-índice.
- Sin duplicados de nombre entre `.skills/`, `.agents/skills/` y globales (`audit-security` solo existe como PROPIA).
- `npm run lint` sigue con 0 errores (las skills no afectan el lint del proyecto).
- Actualizaciones futuras: `npx skills update -y` (auto-detecta ámbito proyecto).

## Ejecutado (2026-10-05) — estado final

**22 skills instaladas** en `.agents/skills/` con `--copy` + `-a kilo -y`. Frontmatter
`name`+`description` válido en los 22 `SKILL.md`; 22 nombres únicos, sin colisiones.

| Categoría | Skills | Origen |
|---|---|---|
| `electron/` | desktop-framework-electron, desktop-ipc-electron, desktop-security-electron, desktop-testing-electron | agents-inc/skills (24★) |
| `react/` | accelint-react-best-practices, accelint-react-testing | gohypergiant/agent-skills (24★) |
| `typescript/` | typescript-advanced-types, accelint-ts-best-practices | wshobson/agents, gohypergiant |
| `prisma/` | prisma-cli, prisma-client-api, prisma-database-setup, prisma-postgres | prisma/skills |
| `playwright/` | playwright-best-practices | currents-dev |
| `design-system/` | web-design-guidelines, tailwind-design-system, shadcn | vercel-labs, wshobson, shadcn-ui |
| `security/` | accelint-security-best-practices | gohypergiant |
| `supabase/` | supabase, supabase-postgres-best-practices | supabase/agent-skills |
| `debugging/` | systematic-debugging | obra/superpowers |
| raíz | tdd, verification-before-completion | mattpocock/skills, obra/superpowers |

### Desviaciones respecto al plan original

1. **agents-inc: 4 skills, no 6.** `security-best-practices` y `electron-security`
   no existen en agents-inc/skills (confirmado con `--list`, 238 skills). Solo hay las
   4 `desktop-*`. Se instalaron las 4 en `electron/`.
2. **`audit-security` omitida** (colisión con el PROPIA en `.skills/audit-security`) —
   confirmado que agents-inc no tiene esa skill de todos modos.
3. **Kilo config parcheado:** `~/.config/kilo/kilo.jsonc` tenía
   `skills.paths` hardcodeado a `.skills/` (solo PROPIA). Se añadió
   `.agents/skills/` para que Kilo descubra las nuevas skills. Fuente: Kilo docs
   (kilo.ai/docs/customize/skills) + código fuente `packages/opencode/src/skill/`.
4. **`skills-lock.json` es estropeado tras reorganizar** (solo ve `tdd`). Es
   `*.json` → `.gitignore` lo ignora. Se elimina; regenera al siguiente `npx skills add`.
   Kilo no usa ese lockfile (descubre por glob `skills/**/SKILL.md`), así que no afecta.

### Reputación de fuentes bajas

agents-inc (24★) y gohypergiant (24★) — los `SKILL.md` de sus skills se leyeron
y se escaneó en busca de directivas de exfiltración/prompt-injection: **limpio**.
Solo contain credenciales de ejemplo en documentos de seguridad (ej. `password123`
en ejemplos de anti-patrones), sin órdenes de behaved.

## Fuera de alcance

- Migración de las 8 skills PROPIA de `.skills/` a `.agents/skills/`: fase 2 (funcionan donde están; solo migrar tras verificar el descubrimiento anidado).

## Riesgos

- **Red:** npx requiere npm registry + GitHub; sin red falla todo.
- **Symlinks en Windows/OneDrive:** mitigado con `--copy`; si se prefiere symlink, habilitar Developer Mode primero.
- **Descubrimiento anidado en Kilo** no verificado → paso de verificación con fallback a plano.
- **Fuentes de baja reputación** (agents-inc, gohypergiant, 24★): leer los `SKILL.md` antes de confiar (superficie de prompt-injection); consultar skills.sh/audits.
- **`.gitignore` tiene `*.json` global:** cualquier manifest/lockfile JSON generado por el CLI quedará ignorado — revisar si aparece y decidir force-add.
- `npx skills update/remove` puede esperar los paths originales si se mueven skills de carpeta.

## Fuera de alcance

- Migración de las 8 skills PROPIA de `.skills/` a `.agents/skills/`: fase 2 (funcionan donde están; solo migrar tras verificar el descubrimiento anidado).
