
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from './logger';

// Dynamic import types for Claude Code
type SDKMessage = any; // Will be properly typed when imported
type ClaudeCodeOptions = any; // Will be properly typed when imported  
type QueryFunction = (params: {
    prompt: string;
    abortController?: AbortController;
    options?: any;
}) => AsyncGenerator<SDKMessage>;

export class ClaudeCodeService {
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;
    private workingDirectory: string = '';
    private outputChannel: vscode.OutputChannel;
    private currentSessionId: string | null = null;
    private claudeCodeQuery: QueryFunction | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // Initialize on construction
        this.initializationPromise = this.initialize();
    }

    private async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            Logger.info('Starting Claude Code initialization...');
            
            // Setup working directory first
            await this.setupWorkingDirectory();

            // Check if API key is configured in extension settings
            const config = vscode.workspace.getConfiguration('superdesign');
            const apiKey = config.get<string>('anthropicApiKey');
            
            // Only set environment variable if we have an API key from settings
            if (apiKey) {
                this.outputChannel.appendLine('Using API key from extension settings');
                process.env.ANTHROPIC_API_KEY = apiKey;
            } else {
                this.outputChannel.appendLine('No API key configured - Claude Code SDK will handle authentication');
            }

            // Dynamically import Claude Code SDK
            Logger.info('Importing Claude Code SDK...');
            try {
                // Try importing from the copied module location first
                let claudeCodeModule;
                try {
                    // Try multiple possible paths for the extension location
                    const possiblePaths = [
                        path.resolve(__dirname, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'sdk.mjs'),
                        path.resolve(__dirname, 'node_modules', '@anthropic-ai', 'claude-code', 'sdk.mjs'),
                        path.join(__dirname, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'sdk.mjs')
                    ];
                    
                    let importSucceeded = false;
                    for (const modulePath of possiblePaths) {
                        try {
                            if (fs.existsSync(modulePath)) {
                                claudeCodeModule = await import(`file://${modulePath}`);
                                importSucceeded = true;
                                break;
                            }
                        } catch (pathError) {
                            continue;
                        }
                    }
                    
                    if (!importSucceeded) {
                        throw new Error('All local import paths failed');
                    }
                } catch (localImportError) {
                    // Fallback to standard import
                    try {
                        claudeCodeModule = await import('@anthropic-ai/claude-code');
                    } catch (standardImportError) {
                        Logger.error(`Claude Code SDK import failed: ${standardImportError}`);
                        throw standardImportError;
                    }
                }
                
                this.claudeCodeQuery = claudeCodeModule.query;
                
                if (!this.claudeCodeQuery) {
                    throw new Error('Query function not found in Claude Code module');
                }
                
                Logger.info('Claude Code SDK imported successfully');
            } catch (importError) {
                Logger.error(`Failed to import Claude Code SDK: ${importError}`);
                throw new Error(`Claude Code SDK import failed: ${importError}`);
            }

            this.isInitialized = true;
            Logger.info('Claude Code SDK initialized successfully');
        } catch (error) {
            Logger.error(`Failed to initialize Claude Code SDK: ${error}`);
            
            // Check if this is an API key related error (no UI popup needed here as error will be handled in chat)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!this.isApiKeyAuthError(errorMessage)) {
                vscode.window.showErrorMessage(`Failed to initialize Claude Code: ${error}`);
            }
            
            // Reset initialization promise so it can be retried
            this.initializationPromise = null;
            this.isInitialized = false;
            throw error;
        }
    }


    private createClaudeMdFile(directory: string): void {
        const claudeMdPath = path.join(directory, 'CLAUDE.md');
        
        Logger.info(`=== SUPERDESIGN DEBUG: createClaudeMdFile called for directory: ${directory}`);
        Logger.info(`=== SUPERDESIGN DEBUG: CLAUDE.md path: ${claudeMdPath}`);
        
        // Check if CLAUDE.md already exists
        if (fs.existsSync(claudeMdPath)) {
            Logger.info(`=== SUPERDESIGN DEBUG: CLAUDE.md already exists at ${claudeMdPath}`);
            const stats = fs.statSync(claudeMdPath);
            Logger.info(`=== SUPERDESIGN DEBUG: Existing file size: ${stats.size} bytes`);
        } else {
            Logger.info(`=== SUPERDESIGN DEBUG: CLAUDE.md does not exist, creating it now...`);
            const claudeMdContent = `# SUPERDESIGN UI DESIGN SYSTEM

# Role
You are a **senior front-end designer**.
You pay close attention to every pixel, spacing, font, color;
Whenever there are UI implementation task, think deeply of the design style first, and then implement UI bit by bit

# Current Context
- Working directory: ${directory}

# When asked to create design:
1. You ALWAYS spin up 3 parallel sub agents concurrently to implement one design with variations, so it's faster for user to iterate (Unless specifically asked to create only one version)

<task_for_each_sub_agent>
1. Build one single html page of just one screen to build a design based on users' feedback/task
2. You ALWAYS output design files in '.superdesign/design_iterations' folder as {design_name}_{n}.html (Where n needs to be unique like table_1.html, table_2.html, etc.) or svg file
3. If you are iterating design based on existing file, then the naming convention should be {current_file_name}_{n}.html, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
</task_for_each_sub_agent>

## When asked to design UI:
1. Similar process as normal design task, but refer to 'UI design & implementation guidelines' for guidelines

## When asked to update or iterate design:
1. Don't edit the existing design, just create a new html file with the same name but with _n.html appended to the end, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
2. At default you should spin up 3 parallel sub agents concurrently to try implement the design, so it's faster for user to iterate

## When asked to design logo or icon:
1. Copy/duplicate existing svg file but name it based on our naming convention in design_iterations folder, and then make edits to the copied svg file (So we can avoid lots of mistakes), like 'original_filename.svg .superdesign/design-iterations/new_filename.svg'
2. Very important sub agent copy first, and Each agent just copy & edit a single svg file with svg code
3. you should focus on the the correctness of the svg code

## When asked to design a component:
1. Similar process as normal design task, and each agent just create a single html page with component inside;
2. Focus just on just one component itself, and don't add any other elements or text
3. Each HTML just have one component with mock data inside

## When asked to design wireframes:
1. Focus on minimal line style black and white wireframes, no colors, and never include any images, just try to use css to make some placeholder images. (Don't use service like placehold.co too, we can't render it)
2. Don't add any annotation of styles, just basic wireframes like Balsamiq style
3. Focus on building out the flow of the wireframes

# When asked to extract design system from images:
Your goal is to extract a generalized and reusable design system from the screenshots provided, **without including specific image content**, so that frontend developers or AI agents can reference the JSON as a style foundation for building consistent UIs.

1. Analyze the screenshots provided:
   * Color palette
   * Typography rules
   * Spacing guidelines
   * Layout structure (grids, cards, containers, etc.)
   * UI components (buttons, inputs, tables, etc.)
   * Border radius, shadows, and other visual styling patterns
2. Create a design-system.json file in 'design_system' folder that clearly defines these rules and can be used to replicate the visual language in a consistent way.
3. if design-system.json already exist, then create a new file with the name design-system_{n}.json (Where n needs to be unique like design-system_1.json, design-system_2.json, etc.)

**Constraints**

* Do **not** extract specific content from the screenshots (no text, logos, icons).
* Focus purely on *design principles*, *structure*, and *styles*.

--------

## Workflow
You should always follow workflow below unless user explicitly ask you to do something else:
1. Layout design
2. Theme design (Color, font, spacing, shadow)
3. Core Animation design
4. Generate a single html file for the UI
5. You HAVE TO confirm with user step by step, don't do theme design until user sign off the layout design, same for all following steps

### 1. Layout design
Think through how should the layout of interface look like, what are different UI components
And present the layout in ASCII wireframe format

### 2. Theme design
Think through what are the colors, fonts, spacing, etc.

### 3. Animation design
Think through what are the animations, transitions, etc.

### 4. Generate html file
Generate html file for each UI component and then combine them together to form a single html file
Make sure to reference the theme patterns shown above, and add custom ones that doesn't exist yet in html file

--------

# UI design & implementation guidelines:

## Design Style
- A **perfect balance** between **elegant minimalism** and **functional design**.
- **Soft, refreshing gradient colors** that seamlessly integrate with the brand palette.
- **Well-proportioned white space** for a clean layout.
- **Light and immersive** user experience.
- **Clear information hierarchy** using **subtle shadows and modular card layouts**.
- **Natural focus on core functionalities**.
- **Refined rounded corners**.
- **Delicate micro-interactions**.
- **Comfortable visual proportions**.
- **Responsive design** You only output responsive design, it needs to look perfect on both mobile, tablet and desktop.
    - If its a mobile app, also make sure you have responsive design OR make the center the mobile UI

## Technical Specifications
1. **Images**: do NEVER include any images, we can't render images in webview. For images, just use placeholder image from public source like unsplash (only if you know exact image url) or use CSS to make placeholder images. Don't use service like placehold.co.
2. **UI Library**: Try to use the **Flowbite** library as a base unless the user specifies otherwise. Import like: \`<script src="https://cdn.jsdelivr.net/npm/flowbite@2.0.0/dist/flowbite.min.js"></script>\`
3. **Styles**: Use **Tailwind CSS** via **CDN** for styling. Import like: \`<script src="https://cdn.tailwindcss.com"></script>\` (Don't load CSS directly as a stylesheet). When creating CSS, include !important for properties that might be overwritten by tailwind & flowbite (e.g., h1, body, etc.)
4. **Icons**: Use Lucide icons or other public icons. Import like: \`<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>\`
5. **Fonts**: Use Google Fonts. Default font choices: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Roboto Mono', 'Space Mono', 'Geist Mono', 'Inter', 'Roboto', 'Open Sans', 'Poppins', 'Montserrat', 'Outfit', 'Plus Jakarta Sans', 'DM Sans', 'Geist', 'Oxanium', 'Architects Daughter', 'Merriweather', 'Playfair Display', 'Lora', 'Source Serif Pro', 'Libre Baskerville', 'Space Grotesk'
6. **Colors**: Avoid using indigo or blue colors unless specified. NEVER use bootstrap-style blue colors unless explicitly requested.
7. **Do not display the status bar** including time, signal, and other system indicators.
8. **All text should be only black or white**.
9. Choose a **4 pt or 8 pt spacing system**—all margins, padding, line-heights, and element sizes must be exact multiples.
10. Use **consistent spacing tokens** (e.g., 4, 8, 16, 24, 32px) — never arbitrary values like 5 px or 13 px.
11. Apply **visual grouping** ("spacing friendship"): tighter gaps (4–8px) for related items, larger gaps (16–24px) for distinct groups.
12. Ensure **typographic rhythm**: font‑sizes, line‑heights, and spacing aligned to the grid (e.g., 16 px text with 24 px line-height).
13. Maintain **touch-area accessibility**: buttons and controls should meet or exceed 48×48 px, padded using grid units.

## 🎨 Color Style
* Use a **minimal palette**: default to **black, white, and neutrals**—no flashy gradients or mismatched hues .
* Follow a **60‑30‑10 ratio**: ~60% background (white/light gray), ~30% surface (white/medium gray), ~10% accents (charcoal/black) .
* Accent colors limited to **one subtle tint** (e.g., charcoal black or very soft beige). Interactive elements like links or buttons use this tone sparingly.
* Always check **contrast** for text vs background via WCAG (≥4.5:1)

## ✍️ Typography & Hierarchy

### 1. 🎯 Hierarchy Levels & Structure
* Always define at least **three typographic levels**: **Heading (H1)**, **Subheading (H2)**, and **Body**.
* Use **size, weight, color**, and **spacing** to create clear differences between them ([toptal.com][1], [skyryedesign.com][2]).
* H1 should stand out clearly (largest & boldest), H2 should be distinctly smaller/medium-weight, and body remains readable and lighter.

### 2. 📏 Size & Scale
* Follow a modular scale: e.g., **H1: 36px**, **H2: 28px**, **Body: 16px** (min). Adjust for mobile if needed .
* Maintain strong contrast—don't use size differences of only 2px; aim for at least **6–8px difference** between levels .

### 3. 🧠 Weight, Style & Color
* Use **bold or medium weight** for headings, **regular** for body.
* Utilize **color contrast** (e.g., darker headings, neutral body) to support hierarchy ([mews.design][3], [toptal.com][1]).
* Avoid excessive styles like italics or uppercase—unless used sparingly for emphasis or subheadings.

### 4. ✂️ Spacing & Rhythm
* Add **0.8×–1.5× line-height** for body and headings to improve legibility ([skyryedesign.com][2]).
* Use consistent **margin spacing above/below headings** (e.g., margin-top: 1.2× line-height) .

## Example Theme Patterns:

### Neo-brutalism style (90s web design feel)
\`\`\`css
:root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0 0 0);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0 0 0);
  --primary: oklch(0.6489 0.2370 26.9728);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9680 0.2110 109.7692);
  --secondary-foreground: oklch(0 0 0);
  --accent: oklch(0.5635 0.2408 260.8178);
  --accent-foreground: oklch(1.0000 0 0);
  --border: oklch(0 0 0);
  --font-sans: DM Sans, sans-serif;
  --font-mono: Space Mono, monospace;
  --radius: 0px;
  --shadow-sm: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
  --shadow: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
  --shadow-lg: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
}
\`\`\`

### Modern dark mode style (Vercel/Linear aesthetic)
\`\`\`css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1450 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1450 0 0);
  --primary: oklch(0.2050 0 0);
  --primary-foreground: oklch(0.9850 0 0);
  --secondary: oklch(0.9700 0 0);
  --secondary-foreground: oklch(0.2050 0 0);
  --accent: oklch(0.9700 0 0);
  --accent-foreground: oklch(0.2050 0 0);
  --border: oklch(0.9220 0 0);
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --radius: 0.625rem;
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
}
\`\`\`
`;

            try {
                fs.writeFileSync(claudeMdPath, claudeMdContent);
                Logger.info(`=== SUPERDESIGN DEBUG: Successfully wrote CLAUDE.md file at ${claudeMdPath}`);
                const stats = fs.statSync(claudeMdPath);
                Logger.info(`=== SUPERDESIGN DEBUG: Created file size: ${stats.size} bytes`);
                Logger.info(`=== SUPERDESIGN DEBUG: CLAUDE.md file creation complete!`);
            } catch (error) {
                Logger.error(`=== SUPERDESIGN DEBUG: Failed to create CLAUDE.md file: ${error}`);
            }
        }
    }

    private async setupWorkingDirectory(): Promise<void> {
        try {
            Logger.info(`=== SUPERDESIGN DEBUG: setupWorkingDirectory called`);
            
            // Try to get workspace root first
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            Logger.info(`=== SUPERDESIGN DEBUG: Workspace root: ${workspaceRoot || 'none'}`);
            
            if (workspaceRoot) {
                // Create .superdesign folder in workspace root
                const superdesignDir = path.join(workspaceRoot, '.superdesign');
                Logger.info(`=== SUPERDESIGN DEBUG: Target .superdesign directory: ${superdesignDir}`);
                
                // Create directory if it doesn't exist
                if (!fs.existsSync(superdesignDir)) {
                    fs.mkdirSync(superdesignDir, { recursive: true });
                    Logger.info(`=== SUPERDESIGN DEBUG: Created .superdesign directory: ${superdesignDir}`);
                } else {
                    Logger.info(`=== SUPERDESIGN DEBUG: .superdesign directory already exists: ${superdesignDir}`);
                }
                
                this.workingDirectory = superdesignDir;
                Logger.info(`=== SUPERDESIGN DEBUG: Working directory set to: ${this.workingDirectory}`);
                
                // Create CLAUDE.md file with UI design system prompt
                this.createClaudeMdFile(superdesignDir);
            } else {
                Logger.warn('No workspace root found, using temporary directory');
                // Fallback to OS temp directory if no workspace
                const tempDir = path.join(os.tmpdir(), 'superdesign-claude');
                
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                    Logger.info(`Created temporary directory: ${tempDir}`);
                }
                
                this.workingDirectory = tempDir;
                
                // Create CLAUDE.md file with UI design system prompt
                this.createClaudeMdFile(tempDir);
                
                vscode.window.showWarningMessage(
                    'No workspace folder found. Using temporary directory for Claude Code operations.'
                );
            }
        } catch (error) {
            Logger.error(`Failed to setup working directory: ${error}`);
            // Final fallback to current working directory
            this.workingDirectory = process.cwd();
            Logger.warn(`Using current working directory as fallback: ${this.workingDirectory}`);
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initializationPromise) {
            await this.initializationPromise;
        }
        if (!this.isInitialized || !this.claudeCodeQuery) {
            // Try to initialize if not already done
            if (!this.initializationPromise) {
                this.initializationPromise = this.initialize();
                await this.initializationPromise;
            } else {
                throw new Error('Claude Code SDK not initialized');
            }
        }
    }

    async query(prompt?: string, conversationMessages?: any, options?: Partial<ClaudeCodeOptions>, abortController?: AbortController, onMessage?: (message: SDKMessage) => void): Promise<SDKMessage[]> {
        // ClaudeCodeService handles conversation via internal session management
        // If conversationMessages are provided, convert them to a prompt
        
        let effectivePrompt = prompt;
        
        if (!effectivePrompt && conversationMessages && conversationMessages.length > 0) {
            // Convert conversation messages to a prompt
            const messages = conversationMessages.map((msg: any) => {
                const content = typeof msg.content === 'string' ? msg.content : 
                    Array.isArray(msg.content) ? msg.content.map((part: any) => 
                        part.type === 'text' ? part.text : `[${part.type}]`
                    ).join('') : '[complex content]';
                return `${msg.role}: ${content}`;
            });
            effectivePrompt = messages.join('\n\n');
            Logger.info('Converted conversation history to prompt');
        }
        
        if (!effectivePrompt) {
            throw new Error('ClaudeCodeService requires a prompt parameter');
        }
        
        Logger.info('=== SUPERDESIGN DEBUG: CLAUDE CODE SERVICE QUERY FUNCTION CALLED ===');
        Logger.info(`=== SUPERDESIGN DEBUG: Query prompt: ${effectivePrompt.substring(0, 200)}...`);
        Logger.info(`=== SUPERDESIGN DEBUG: Query options: ${JSON.stringify(options, null, 2)}`);
        Logger.info(`=== SUPERDESIGN DEBUG: Streaming enabled: ${!!onMessage}`);

        await this.ensureInitialized();

        const messages: SDKMessage[] = [];
        const systemPrompt = `# Role
You are a **senior front-end designer**.
You pay close attention to every pixel, spacing, font, color;
Whenever there are UI implementation task, think deeply of the design style first, and then implement UI bit by bit

# Current Context
- Working directory: ${this.workingDirectory}

# When asked to create design:
1. You ALWAYS spin up 3 parallel sub agents concurrently to implemeht one design with variations, so it's faster for user to iterate (Unless specifically asked to create only one version)

<task_for_each_sub_agent>
1. Build one single html page of just one screen to build a design based on users' feedback/task
2. You ALWAYS output design files in '.superdesign/design_iterations' folder as {design_name}_{n}.html (Where n needs to be unique like table_1.html, table_2.html, etc.) or svg file
3. If you are iterating design based on existing file, then the naming convention should be {current_file_name}_{n}.html, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
</task_for_each_sub_agent>

## When asked to design UI:
1. Similar process as normal design task, but refer to 'UI design & implementation guidelines' for guidelines

## When asked to update or iterate design:
1. Don't edit the existing design, just create a new html file with the same name but with _n.html appended to the end, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
2. At default you should spin up 3 parallel sub agents concurrently to try implement the design, so it's faster for user to iterate

## When asked to design logo or icon:
1. Copy/duplicate existing svg file but name it based on our naming convention in design_ierations folder, and then make edits to the copied svg file (So we can avoid lots of mistakes), like 'original_filename.svg .superdesign/design-iterations/new_filename.svg'
2. Very important sub agent copy first, and Each agent just copy & edit a single svg file with svg code
3. you should focus on the the correctness of the svg code

## When asked to design a component:
1. Similar process as normal design task, and each agent just create a single html page with component inside;
2. Focus just on just one component itself, and don't add any other elements or text
3. Each HTML just have one component with mock data inside

## When asked to design wireframes:
1. Focus on minimal line style black and white wireframes, no colors, and never include any images, just try to use css to make some placeholder images. (Don't use service like placehold.co too, we can't render it)
2. Don't add any annotation of styles, just basic wireframes like Balsamiq style
3. Focus on building out the flow of the wireframes

# When asked to extract design system from images:
Your goal is to extract a generalized and reusable design system from the screenshots provided, **without including specific image content**, so that frontend developers or AI agents can reference the JSON as a style foundation for building consistent UIs.

1. Analyze the screenshots provided:
   * Color palette
   * Typography rules
   * Spacing guidelines
   * Layout structure (grids, cards, containers, etc.)
   * UI components (buttons, inputs, tables, etc.)
   * Border radius, shadows, and other visual styling patterns
2. Create a design-system.json file in 'design_system' folder that clearly defines these rules and can be used to replicate the visual language in a consistent way.
3. if design-system.json already exist, then create a new file with the name design-system_{n}.json (Where n needs to be unique like design-system_1.json, design-system_2.json, etc.)

**Constraints**

* Do **not** extract specific content from the screenshots (no text, logos, icons).
* Focus purely on *design principles*, *structure*, and *styles*.

--------

## Workflow
You should always follow workflow below unless user explicitly ask you to do something else:
1. Layout design
2. Theme design (Color, font, spacing, shadow)
3. Core Animation design
4. Generate a single html file for the UI
5. You HAVE TO confirm with user step by step, don't do theme design until user sign off the layout design, same for all following steps

### 1. Layout design
Think through how should the layout of interface look like, what are different UI components
And present the layout in ASCII wireframe format

### 2. Theme design
Think through what are the colors, fonts, spacing, etc.

### 3. Animation design
Think through what are the animations, transitions, etc.

### 4. Generate html file
Generate html file for each UI component and then combine them together to form a single html file
Make sure to reference the theme patterns shown above, and add custom ones that doesn't exist yet in html file

--------

# UI design & implementation guidelines:

## Design Style
- A **perfect balance** between **elegant minimalism** and **functional design**.
- **Soft, refreshing gradient colors** that seamlessly integrate with the brand palette.
- **Well-proportioned white space** for a clean layout.
- **Light and immersive** user experience.
- **Clear information hierarchy** using **subtle shadows and modular card layouts**.
- **Natural focus on core functionalities**.
- **Refined rounded corners**.
- **Delicate micro-interactions**.
- **Comfortable visual proportions**.
- **Responsive design** You only output responsive design, it needs to look perfect on both mobile, tablet and desktop.
    - If its a mobile app, also make sure you have responsive design OR make the center the mobile UI

## Technical Specifications
1. **Images**: do NEVER include any images, we can't render images in webview. For images, just use placeholder image from public source like unsplash (only if you know exact image url) or use CSS to make placeholder images. Don't use service like placehold.co.
2. **UI Library**: Try to use the **Flowbite** library as a base unless the user specifies otherwise. Import like: \`<script src="https://cdn.jsdelivr.net/npm/flowbite@2.0.0/dist/flowbite.min.js"></script>\`
3. **Styles**: Use **Tailwind CSS** via **CDN** for styling. Import like: \`<script src="https://cdn.tailwindcss.com"></script>\` (Don't load CSS directly as a stylesheet). When creating CSS, include !important for properties that might be overwritten by tailwind & flowbite (e.g., h1, body, etc.)
4. **Icons**: Use Lucide icons or other public icons. Import like: \`<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>\`
5. **Fonts**: Use Google Fonts. Default font choices: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Roboto Mono', 'Space Mono', 'Geist Mono', 'Inter', 'Roboto', 'Open Sans', 'Poppins', 'Montserrat', 'Outfit', 'Plus Jakarta Sans', 'DM Sans', 'Geist', 'Oxanium', 'Architects Daughter', 'Merriweather', 'Playfair Display', 'Lora', 'Source Serif Pro', 'Libre Baskerville', 'Space Grotesk'
6. **Colors**: Avoid using indigo or blue colors unless specified. NEVER use bootstrap-style blue colors unless explicitly requested.
7. **Do not display the status bar** including time, signal, and other system indicators.
8. **All text should be only black or white**.
9. Choose a **4 pt or 8 pt spacing system**—all margins, padding, line-heights, and element sizes must be exact multiples.
10. Use **consistent spacing tokens** (e.g., 4, 8, 16, 24, 32px) — never arbitrary values like 5 px or 13 px.
11. Apply **visual grouping** ("spacing friendship"): tighter gaps (4–8px) for related items, larger gaps (16–24px) for distinct groups.
12. Ensure **typographic rhythm**: font‑sizes, line‑heights, and spacing aligned to the grid (e.g., 16 px text with 24 px line-height).
13. Maintain **touch-area accessibility**: buttons and controls should meet or exceed 48×48 px, padded using grid units.

## 🎨 Color Style
* Use a **minimal palette**: default to **black, white, and neutrals**—no flashy gradients or mismatched hues .
* Follow a **60‑30‑10 ratio**: \~60% background (white/light gray), \~30% surface (white/medium gray), \~10% accents (charcoal/black) .
* Accent colors limited to **one subtle tint** (e.g., charcoal black or very soft beige). Interactive elements like links or buttons use this tone sparingly.
* Always check **contrast** for text vs background via WCAG (≥4.5:1)

## ✍️ Typography & Hierarchy

### 1. 🎯 Hierarchy Levels & Structure
* Always define at least **three typographic levels**: **Heading (H1)**, **Subheading (H2)**, and **Body**.
* Use **size, weight, color**, and **spacing** to create clear differences between them ([toptal.com][1], [skyryedesign.com][2]).
* H1 should stand out clearly (largest & boldest), H2 should be distinctly smaller/medium-weight, and body remains readable and lighter.

### 2. 📏 Size & Scale
* Follow a modular scale: e.g., **H1: 36px**, **H2: 28px**, **Body: 16px** (min). Adjust for mobile if needed .
* Maintain strong contrast—don't use size differences of only 2px; aim for at least **6–8px difference** between levels .

### 3. 🧠 Weight, Style & Color
* Use **bold or medium weight** for headings, **regular** for body.
* Utilize **color contrast** (e.g., darker headings, neutral body) to support hierarchy ([mews.design][3], [toptal.com][1]).
* Avoid excessive styles like italics or uppercase—unless used sparingly for emphasis or subheadings.

### 4. ✂️ Spacing & Rhythm
* Add **0.8×–1.5× line-height** for body and headings to improve legibility ([skyryedesign.com][2]).
* Use consistent **margin spacing above/below headings** (e.g., margin-top: 1.2× line-height) .

## Example Theme Patterns:

### Neo-brutalism style (90s web design feel)
\`\`\`css
:root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0 0 0);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0 0 0);
  --primary: oklch(0.6489 0.2370 26.9728);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9680 0.2110 109.7692);
  --secondary-foreground: oklch(0 0 0);
  --accent: oklch(0.5635 0.2408 260.8178);
  --accent-foreground: oklch(1.0000 0 0);
  --border: oklch(0 0 0);
  --font-sans: DM Sans, sans-serif;
  --font-mono: Space Mono, monospace;
  --radius: 0px;
  --shadow-sm: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
  --shadow: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
  --shadow-lg: 4px 4px 0px 0px hsl(0 0% 0% / 1.00);
}
\`\`\`

### Modern dark mode style (Vercel/Linear aesthetic)
\`\`\`css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1450 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1450 0 0);
  --primary: oklch(0.2050 0 0);
  --primary-foreground: oklch(0.9850 0 0);
  --secondary: oklch(0.9700 0 0);
  --secondary-foreground: oklch(0.2050 0 0);
  --accent: oklch(0.9700 0 0);
  --accent-foreground: oklch(0.2050 0 0);
  --border: oklch(0.9220 0 0);
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --radius: 0.625rem;
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10);
}
\`\`\`

`;
        
        Logger.info(`=== SUPERDESIGN DEBUG: System prompt length: ${systemPrompt.length} characters`);
        Logger.info(`=== SUPERDESIGN DEBUG: System prompt first 500 chars: ${systemPrompt.substring(0, 500)}...`);
        
        try {
            const finalOptions: Partial<ClaudeCodeOptions> = {
                maxTurns: 999,
                allowedTools: [
                    "Edit",
                    "Read", 
                    "Create",
                    "Write",
                    "Glob",
                    "Grep", 
                    "LS",
                    "WebFetch",
                    "TodoRead",
                    "TodoWrite",
                    "WebSearch",
                    "MultiEdit",
                    "Search",
                    "Update",
                    "Task",
                    "Delete",
                    "Bash",
                ],
                permissionMode: 'acceptEdits' as const,
                cwd: this.workingDirectory,
                customSystemPrompt: systemPrompt,
                ...options
            };
            
            Logger.info(`=== SUPERDESIGN DEBUG: Final options customSystemPrompt set: ${!!finalOptions.customSystemPrompt}`);
            Logger.info(`=== SUPERDESIGN DEBUG: Final options customSystemPrompt length: ${finalOptions.customSystemPrompt?.length || 0}`);

            if (this.currentSessionId) {
                Logger.info(`=== SUPERDESIGN DEBUG: Resuming existing session: ${this.currentSessionId}`);
                finalOptions.resume = this.currentSessionId;
            } else {
                Logger.info(`=== SUPERDESIGN DEBUG: Starting new session (no cached session)`);
            }

            const queryParams = {
                prompt: effectivePrompt,
                abortController: abortController || new AbortController(),
                options: finalOptions
            };

            if (!this.claudeCodeQuery) {
                throw new Error('Claude Code SDK not properly initialized - query function not available');
            }

            Logger.info(`=== SUPERDESIGN DEBUG: About to call Claude Code SDK query with params...`);
            Logger.info(`=== SUPERDESIGN DEBUG: Query params prompt length: ${queryParams.prompt.length}`);
            Logger.info(`=== SUPERDESIGN DEBUG: Query params options keys: ${Object.keys(queryParams.options)}`);
            Logger.info(`=== SUPERDESIGN DEBUG: Complete query parameters being sent to Claude SDK:`);
            Logger.info(`=== SUPERDESIGN DEBUG: - Prompt: "${queryParams.prompt}"`);
            Logger.info(`=== SUPERDESIGN DEBUG: - Options: ${JSON.stringify(queryParams.options, null, 2)}`);
            Logger.info(`=== SUPERDESIGN DEBUG: - Working directory (cwd): ${queryParams.options.cwd}`);
            Logger.info(`=== SUPERDESIGN DEBUG: - Has custom system prompt: ${!!queryParams.options.customSystemPrompt}`);
            Logger.info(`=== SUPERDESIGN DEBUG: - Session resume ID: ${queryParams.options.resume || 'none'}`);
            
            // Check if CLAUDE.md exists in the working directory
            const claudeMdPath = path.join(this.workingDirectory, 'CLAUDE.md');
            Logger.info(`=== SUPERDESIGN DEBUG: Checking for CLAUDE.md at: ${claudeMdPath}`);
            if (fs.existsSync(claudeMdPath)) {
                const stats = fs.statSync(claudeMdPath);
                Logger.info(`=== SUPERDESIGN DEBUG: CLAUDE.md EXISTS! Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
            } else {
                Logger.warn(`=== SUPERDESIGN DEBUG: CLAUDE.md NOT FOUND at ${claudeMdPath}`);
            }
            
            // Also check parent directory for CLAUDE.md
            const parentDir = path.dirname(this.workingDirectory);
            const parentClaudeMd = path.join(parentDir, 'CLAUDE.md');
            Logger.info(`=== SUPERDESIGN DEBUG: Checking parent directory for CLAUDE.md at: ${parentClaudeMd}`);
            if (fs.existsSync(parentClaudeMd)) {
                const parentStats = fs.statSync(parentClaudeMd);
                Logger.warn(`=== SUPERDESIGN DEBUG: WARNING! CLAUDE.md found in parent directory! Size: ${parentStats.size} bytes`);
                Logger.warn(`=== SUPERDESIGN DEBUG: This parent CLAUDE.md might override our custom system prompt!`);
            } else {
                Logger.info(`=== SUPERDESIGN DEBUG: No CLAUDE.md in parent directory (good!)`);
            }

            for await (const message of this.claudeCodeQuery(queryParams)) {
                Logger.info(`Received SDK message type: ${(message as any).type}`);
                Logger.info(`Full SDK message: ${JSON.stringify(message)}`);
                messages.push(message as SDKMessage);
                
                // Convert SDK message to CoreMessage format for streaming
                if (onMessage) {
                    try {
                        // Check message type and convert accordingly
                        if ((message as any).type === 'text' && (message as any).text) {
                            // Text message from assistant
                            Logger.info(`Converting text message: ${(message as any).text.substring(0, 100)}...`);
                            const coreMessage = {
                                role: 'assistant',
                                content: (message as any).text
                            };
                            onMessage(coreMessage as any);
                        } else if ((message as any).type === 'tool_use') {
                            // Tool use message
                            Logger.info(`Converting tool_use message: ${(message as any).name}`);
                            const coreMessage = {
                                role: 'assistant',
                                content: [{
                                    type: 'tool-call',
                                    toolCallId: (message as any).id,
                                    toolName: (message as any).name,
                                    args: (message as any).input
                                }]
                            };
                            onMessage(coreMessage as any);
                        } else if ((message as any).type === 'tool_result') {
                            // Tool result message
                            Logger.info(`Converting tool_result message`);
                            const coreMessage = {
                                role: 'tool',
                                content: [{
                                    type: 'tool-result',
                                    toolCallId: (message as any).tool_use_id,
                                    toolName: '', // SDK doesn't provide tool name in result
                                    result: (message as any).content
                                }]
                            };
                            onMessage(coreMessage as any);
                        } else if ((message as any).type === 'assistant' && (message as any).message) {
                            // Assistant message with message property
                            Logger.info(`Converting assistant message with message property`);
                            const content = typeof (message as any).message === 'string' ? 
                                (message as any).message : 
                                (message as any).message.content || '';
                            const coreMessage = {
                                role: 'assistant',
                                content: content
                            };
                            onMessage(coreMessage as any);
                        } else if ((message as any).type === 'result') {
                            // Result message - these often contain tool execution results
                            Logger.info(`Converting result message`);
                            if ((message as any).content || (message as any).result) {
                                const content = (message as any).content || (message as any).result;
                                const coreMessage = {
                                    role: 'tool',
                                    content: [{
                                        type: 'tool-result',
                                        toolCallId: (message as any).parent_tool_use_id || 'unknown',
                                        toolName: '',
                                        result: typeof content === 'string' ? content : JSON.stringify(content)
                                    }]
                                };
                                onMessage(coreMessage as any);
                            }
                        } else {
                            Logger.warn(`Unknown SDK message type: ${(message as any).type}`);
                        }
                    } catch (callbackError) {
                        Logger.error(`Streaming callback error: ${callbackError}`);
                        // Don't break the loop if callback fails
                    }
                }
            }

            const lastMessageWithSessionId = [...messages].reverse().find(m => 'session_id' in m && m.session_id);
            if (lastMessageWithSessionId && 'session_id' in lastMessageWithSessionId && lastMessageWithSessionId.session_id) {
                this.currentSessionId = lastMessageWithSessionId.session_id;
            }

            Logger.info(`Query completed successfully. Received ${messages.length} messages`);
            return messages;
        } catch (error) {
            Logger.error(`Claude Code query failed: ${error}`);
            
            // Check if this is an API key authentication error (handled in chat interface)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!this.isApiKeyAuthError(errorMessage)) {
                vscode.window.showErrorMessage(`Claude Code query failed: ${error}`);
            }
            throw error;
        }
    }

    get isReady(): boolean {
        return this.isInitialized;
    }

    async waitForInitialization(): Promise<boolean> {
        try {
            await this.ensureInitialized();
            return true;
        } catch (error) {
            Logger.error(`Initialization failed: ${error}`);
            return false;
        }
    }

    getWorkingDirectory(): string {
        return this.workingDirectory;
    }

    // Method to refresh API key from settings and reinitialize if needed
    async refreshApiKey(): Promise<boolean> {
        try {
            const config = vscode.workspace.getConfiguration('superdesign');
            const apiKey = config.get<string>('anthropicApiKey');
            
            if (!apiKey) {
                Logger.warn('No API key found during refresh');
                return false;
            }

            // Update environment variable
            process.env.ANTHROPIC_API_KEY = apiKey;
            Logger.info('API key refreshed from settings');
            
            // If not initialized yet, try to initialize
            if (!this.isInitialized) {
                try {
                    await this.initialize();
                    return true;
                } catch (error) {
                    Logger.error(`Failed to initialize after API key refresh: ${error}`);
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            Logger.error(`Failed to refresh API key: ${error}`);
            return false;
        }
    }

    // Method to check if API key is configured
    hasApiKey(): boolean {
        // Always return true since Claude Code SDK can handle auth on its own
        return true;
    }

    // Method to detect if an error is related to API key authentication
    public isApiKeyAuthError(errorMessage: string): boolean {
        // Claude Code SDK handles its own authentication
        // We only return true for specific Claude Code authentication errors
        const authErrorPatterns = [
            'authentication failed',
            'invalid api key',
            'unauthorized',
            'authentication error',
            'invalid token',
            'access denied',
            '401',
            'ANTHROPIC_API_KEY'
        ];
        
        const lowercaseMessage = errorMessage.toLowerCase();
        const isAuthError = authErrorPatterns.some(pattern => lowercaseMessage.includes(pattern));
        
        Logger.info(`ClaudeCodeService - Checking if error is auth-related: "${errorMessage}" -> ${isAuthError}`);
        if (isAuthError) {
            const matchedPattern = authErrorPatterns.find(pattern => lowercaseMessage.includes(pattern));
            Logger.info(`ClaudeCodeService - Matched pattern: "${matchedPattern}"`);
        }
        
        return isAuthError;
    }

    // Method to clear the current session
    public clearSession(): void {
        Logger.info(`=== SUPERDESIGN DEBUG: Clearing session. Old session ID: ${this.currentSessionId || 'none'}`);
        this.currentSessionId = null;
        Logger.info('=== SUPERDESIGN DEBUG: Session cleared. Next query will start a fresh session with UI design system prompt.');
    }
} 