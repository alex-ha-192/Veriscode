import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

function sanitizeModuleName(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_]/g, "_");
  const withLeadingLetter = /^[A-Za-z_]/.test(cleaned) ? cleaned : `m_${cleaned}`;
  return withLeadingLetter.length > 0 ? withLeadingLetter : "my_design";
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

  const moduleName = sanitizeModuleName(projectName);
  const projectDir = path.join(parentUris[0].fsPath, projectName.trim());

  if (fs.existsSync(projectDir)) {
    void vscode.window.showErrorMessage(`"${projectDir}" already exists.`);
    return;
  }

  fs.mkdirSync(projectDir, { recursive: true });

  const templatePath = path.join(context.extensionPath, "templates", "default.sv");
  const template = fs.readFileSync(templatePath, "utf8").replace(/\bmodule counter\b/, `module ${moduleName}`);
  const svPath = path.join(projectDir, `${moduleName}.sv`);
  fs.writeFileSync(svPath, template, "utf8");

  const readme =
    `# ${projectName}\n\n` +
    `A SystemVerilog project created with Veriscode.\n\n` +
    `- Edit \`${moduleName}.sv\` - Verible lints it as you type.\n` +
    `- Click the ▶ Simulate button above the editor (or run "Veriscode: Simulate") to open an ` +
    `interactive, cycle-by-cycle simulation with a live timing diagram.\n`;
  fs.writeFileSync(path.join(projectDir, "README.md"), readme, "utf8");

  const openInNewWindow = vscode.workspace.workspaceFolders !== undefined;
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir), {
    forceNewWindow: openInNewWindow,
  });
}
