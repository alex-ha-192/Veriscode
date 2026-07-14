import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TEMPLATES, TemplateOption } from "./templates";

function sanitizeModuleName(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_]/g, "_");
  const withLeadingLetter = /^[A-Za-z_]/.test(cleaned) ? cleaned : `m_${cleaned}`;
  return withLeadingLetter.length > 0 ? withLeadingLetter : "my_design";
}

interface TemplateQuickPickItem extends vscode.QuickPickItem {
  template: TemplateOption;
}

async function pickTemplate(): Promise<TemplateOption | undefined> {
  const items: TemplateQuickPickItem[] = TEMPLATES.map((template) => ({
    label: template.label,
    description: template.description,
    template,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: "New SystemVerilog Project",
    placeHolder: "Choose a starting point",
  });
  return picked?.template;
}

function writeSingleRenamed(templatesDir: string, projectDir: string, template: TemplateOption, moduleName: string): void {
  const srcPath = path.join(templatesDir, template.files[0]);
  const src = fs.readFileSync(srcPath, "utf8");
  const originalName = /\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)/.exec(src)?.[1];
  const renamed = originalName
    ? src.replace(new RegExp(`\\bmodule\\s+${originalName}\\b`), `module ${moduleName}`)
    : src;
  fs.writeFileSync(path.join(projectDir, `${moduleName}.sv`), renamed, "utf8");
}

function copyFilesVerbatim(templatesDir: string, projectDir: string, template: TemplateOption): void {
  for (const relPath of template.files) {
    const srcPath = path.join(templatesDir, relPath);
    const destPath = path.join(projectDir, path.basename(relPath));
    fs.copyFileSync(srcPath, destPath);
  }
}

function writeGenericReadme(projectDir: string, projectName: string, mainFile: string): void {
  const readme =
    `# ${projectName}\n\n` +
    `A SystemVerilog project created with Veriscode.\n\n` +
    `- Edit \`${mainFile}\` - Verible lints it as you type.\n` +
    `- Click the ▶ Simulate button above the editor (or run "Veriscode: Simulate") to open an ` +
    `interactive, cycle-by-cycle simulation with a live timing diagram.\n`;
  fs.writeFileSync(path.join(projectDir, "README.md"), readme, "utf8");
}

export async function newProjectCommand(context: vscode.ExtensionContext): Promise<void> {
  const projectName = await vscode.window.showInputBox({
    title: "New SystemVerilog Project",
    prompt: "Project name",
    value: "my_design",
    validateInput: (value) => (value.trim().length === 0 ? "Enter a project name." : undefined),
  });
  if (!projectName) {
    return;
  }

  const template = await pickTemplate();
  if (!template) {
    return;
  }

  const parentUris = await vscode.window.showOpenDialog({
    title: "Choose a location for the new project",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Create Project Here",
  });
  if (!parentUris || parentUris.length === 0) {
    return;
  }

  const projectDir = path.join(parentUris[0].fsPath, projectName.trim());
  if (fs.existsSync(projectDir)) {
    void vscode.window.showErrorMessage(`"${projectDir}" already exists.`);
    return;
  }
  fs.mkdirSync(projectDir, { recursive: true });

  const templatesDir = path.join(context.extensionPath, "templates");

  if (template.kind === "single-renamed") {
    const moduleName = sanitizeModuleName(projectName);
    writeSingleRenamed(templatesDir, projectDir, template, moduleName);
    writeGenericReadme(projectDir, projectName, `${moduleName}.sv`);
  } else if (template.kind === "files") {
    copyFilesVerbatim(templatesDir, projectDir, template);
    const mainFile = path.basename(template.files[template.files.length - 1]);
    writeGenericReadme(projectDir, projectName, mainFile);
  } else {
    copyFilesVerbatim(templatesDir, projectDir, template);
    const guidePath = path.join(templatesDir, "workshop", "GUIDE.md");
    fs.copyFileSync(guidePath, path.join(projectDir, "README.md"));
  }

  const openInNewWindow = vscode.workspace.workspaceFolders !== undefined;
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir), {
    forceNewWindow: openInNewWindow,
  });
}
