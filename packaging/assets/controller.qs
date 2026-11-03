// This installer always installs exactly one component.
function Controller() {
    if (installer.isInstaller() && !installer.isCommandLineInstance()) {
        installer.setDefaultPageVisible(QInstaller.ComponentSelection, false);
        installer.setDefaultPageVisible(QInstaller.StartMenuSelection, false);
    }
}
