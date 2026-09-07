//! Project listing from curated metadata or bounded Git discovery.
//!
//! Extracted from the earlier `apps/desktop/src-tauri/src/projects.rs` source at commit
//! `7647c209550eb7def6b7d3d2776e13ea6763dabe`. The explicit [`ProjectLocations`]
//! input isolates filesystem policy from process-global environment state. [`get_projects`]
//! preserves the legacy public entry point by delegating to the macOS projection.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub path: String,
    pub status: ProjectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Active,
    Paused,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectLocations {
    pub home: PathBuf,
    pub curated_file: PathBuf,
    pub discovery_root: PathBuf,
}

fn load_curated(path: &Path) -> Option<Vec<ProjectEntry>> {
    let text = std::fs::read_to_string(path).ok()?;
    let entries: Vec<ProjectEntry> = serde_json::from_str(&text).ok()?;
    (!entries.is_empty()).then_some(entries)
}

fn shorten_home(path: &Path, home: &Path) -> String {
    path.strip_prefix(home)
        .map(|relative| {
            // The `~/` form is a display path, and the neutral fixture pins it with forward
            // slashes on every host, so the separator cannot come from `Display`. Replacing
            // MAIN_SEPARATOR rather than a literal `\` keeps this a no-op on Unix, where a
            // backslash is a legal character in a directory name and must survive untouched.
            format!(
                "~/{}",
                relative
                    .display()
                    .to_string()
                    .replace(std::path::MAIN_SEPARATOR, "/")
            )
        })
        .unwrap_or_else(|_| path.display().to_string())
}

fn discovered_entry(path: &Path, home: &Path) -> ProjectEntry {
    ProjectEntry {
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string()),
        path: shorten_home(path, home),
        status: ProjectStatus::Active,
        last_opened: None,
    }
}

fn discover_projects(locations: &ProjectLocations) -> Vec<ProjectEntry> {
    let Ok(depth_one) = std::fs::read_dir(&locations.discovery_root) else {
        return Vec::new();
    };
    let mut projects = Vec::new();
    for entry in depth_one.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.join(".git").is_dir() {
            projects.push(discovered_entry(&path, &locations.home));
            continue;
        }
        let Ok(depth_two) = std::fs::read_dir(&path) else {
            continue;
        };
        for child in depth_two.flatten() {
            let child_path = child.path();
            if child_path.is_dir() && child_path.join(".git").is_dir() {
                projects.push(discovered_entry(&child_path, &locations.home));
            }
        }
    }
    projects.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.path.cmp(&right.path))
    });
    projects
}

pub fn get_projects_from(locations: &ProjectLocations) -> Vec<ProjectEntry> {
    load_curated(&locations.curated_file).unwrap_or_else(|| discover_projects(locations))
}

pub fn get_projects() -> Vec<ProjectEntry> {
    crate::macos::get_projects()
}
