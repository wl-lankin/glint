// No console window next to Glint in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    glint_lib::run()
}
