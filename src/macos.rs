//! macOS filesystem projection for the neutral project catalog.

use crate::projects::{get_projects_from, ProjectEntry, ProjectLocations};
use std::path::PathBuf;

pub fn project_locations(home: impl Into<PathBuf>) -> ProjectLocations {
    let home = home.into();
    ProjectLocations {
        curated_file: home
            .join("Library")
            .join("Application Support")
            .join("Tender")
            .join("projects.json"),
        discovery_root: home.join("Projects"),
        home,
    }
}

pub fn get_projects() -> Vec<ProjectEntry> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    get_projects_from(&project_locations(home))
}
