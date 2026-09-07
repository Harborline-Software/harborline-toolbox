use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tender_lib::macos::project_locations;
use tender_lib::projects::{get_projects_from, ProjectLocations};

static SANDBOX_ID: AtomicU64 = AtomicU64::new(0);

struct Sandbox {
    root: PathBuf,
}

impl Sandbox {
    fn new(label: &str) -> Self {
        let id = SANDBOX_ID.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "harborline-toolbox-{label}-{}-{id}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create sandbox");
        Self { root }
    }

    fn home(&self) -> PathBuf {
        self.root.join("home")
    }

    fn locations(&self) -> ProjectLocations {
        project_locations(self.home())
    }

    fn git_repo(&self, relative: impl AsRef<Path>) {
        fs::create_dir_all(self.home().join(relative).join(".git")).expect("create git fixture");
    }
}

impl Drop for Sandbox {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn fixture() -> Value {
    serde_json::from_str(include_str!("../conformance/htbx.projects/fixtures.yaml"))
        .expect("neutral project fixture parses")
}

fn expected(case_id: &str) -> Value {
    fixture()["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .find(|case| case["id"] == case_id)
        .unwrap_or_else(|| panic!("missing fixture {case_id}"))["expected"]
        .clone()
}

fn expected_variant(case_id: &str, variant: &str) -> Value {
    fixture()["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .find(|case| case["id"] == case_id)
        .unwrap_or_else(|| panic!("missing fixture {case_id}"))["expectedVariants"][variant]
        .clone()
}

#[test]
fn projects_curated_precedence() {
    let sandbox = Sandbox::new("curated-precedence");
    sandbox.git_repo("Projects/discovered");
    let locations = sandbox.locations();
    fs::create_dir_all(locations.curated_file.parent().expect("curated parent"))
        .expect("create app support");
    fs::write(
        &locations.curated_file,
        r#"[{"name":"Curated","path":"/curated/project","status":"paused","lastOpened":"2026-08-01T12:00:00Z"}]"#,
    )
    .expect("write curated fixture");

    assert_eq!(
        serde_json::to_value(get_projects_from(&locations)).unwrap(),
        expected("projects.curated.precedence")
    );
}

#[test]
fn projects_curated_empty_falls_back() {
    let sandbox = Sandbox::new("curated-empty");
    sandbox.git_repo("Projects/fallback");
    let locations = sandbox.locations();
    fs::create_dir_all(locations.curated_file.parent().expect("curated parent"))
        .expect("create app support");
    fs::write(&locations.curated_file, "[]").expect("write empty curated fixture");

    assert_eq!(
        serde_json::to_value(get_projects_from(&locations)).unwrap(),
        expected("projects.curated.empty-falls-back")
    );
}

#[test]
fn projects_discovery_depth_one() {
    let sandbox = Sandbox::new("depth-one");
    sandbox.git_repo("Projects/depth-one");

    assert_eq!(
        serde_json::to_value(get_projects_from(&sandbox.locations())).unwrap(),
        expected("projects.discovery.depth-one")
    );
}

#[test]
fn projects_discovery_depth_two() {
    let sandbox = Sandbox::new("depth-two");
    sandbox.git_repo("Projects/Harborline/depth-two");

    assert_eq!(
        serde_json::to_value(get_projects_from(&sandbox.locations())).unwrap(),
        expected("projects.discovery.depth-two")
    );
}

#[test]
fn projects_discovery_excludes_non_git_and_depth_three() {
    let sandbox = Sandbox::new("discovery-exclusions");
    sandbox.git_repo("Projects/included");
    fs::create_dir_all(sandbox.home().join("Projects/plain")).expect("create non-git directory");
    sandbox.git_repo("Projects/org/nested/depth-three");
    fs::write(sandbox.home().join("Projects/not-a-directory"), "file").expect("create file");

    assert_eq!(
        serde_json::to_value(get_projects_from(&sandbox.locations())).unwrap(),
        expected("projects.discovery.excludes-non-git-and-depth-three")
    );
}

#[test]
fn projects_discovery_stable_name_order() {
    let sandbox = Sandbox::new("stable-order");
    sandbox.git_repo("Projects/org-a/zulu");
    sandbox.git_repo("Projects/middle");
    sandbox.git_repo("Projects/org-b/alpha");

    assert_eq!(
        serde_json::to_value(get_projects_from(&sandbox.locations())).unwrap(),
        expected("projects.discovery.stable-name-order")
    );
}

#[test]
fn projects_path_home_shortening() {
    let sandbox = Sandbox::new("home-shortening");
    sandbox.git_repo("Projects/shortened");

    assert_eq!(
        serde_json::to_value(get_projects_from(&sandbox.locations())).unwrap(),
        expected("projects.path.home-shortening")
    );
}

#[test]
fn projects_fail_soft_missing_invalid_unreadable() {
    let missing = Sandbox::new("fail-soft-missing");
    let missing_result = get_projects_from(&project_locations(missing.root.join("missing-home")));
    assert_eq!(
        serde_json::to_value(missing_result).unwrap(),
        expected_variant("projects.fail-soft.missing-invalid-unreadable", "missing")
    );

    let invalid = Sandbox::new("fail-soft-invalid");
    invalid.git_repo("Projects/fallback");
    let invalid_locations = invalid.locations();
    fs::create_dir_all(
        invalid_locations
            .curated_file
            .parent()
            .expect("curated parent"),
    )
    .expect("create app support");
    fs::write(&invalid_locations.curated_file, "{").expect("write invalid JSON");
    assert_eq!(
        serde_json::to_value(get_projects_from(&invalid_locations)).unwrap(),
        expected_variant(
            "projects.fail-soft.missing-invalid-unreadable",
            "invalidCuratedFallsBack"
        )
    );

    let unreadable_curated = Sandbox::new("fail-soft-curated-directory");
    unreadable_curated.git_repo("Projects/fallback");
    let unreadable_curated_locations = unreadable_curated.locations();
    fs::create_dir_all(&unreadable_curated_locations.curated_file)
        .expect("use a directory where a readable curated file is expected");
    assert_eq!(
        serde_json::to_value(get_projects_from(&unreadable_curated_locations)).unwrap(),
        expected_variant(
            "projects.fail-soft.missing-invalid-unreadable",
            "unreadableCuratedFallsBack"
        )
    );

    let unreadable_discovery = Sandbox::new("fail-soft-discovery-file");
    fs::create_dir_all(unreadable_discovery.home()).expect("create home");
    let discovery_file = unreadable_discovery.home().join("not-a-directory");
    fs::write(&discovery_file, "file").expect("create unreadable discovery stand-in");
    let unreadable_discovery_locations = ProjectLocations {
        home: unreadable_discovery.home(),
        curated_file: unreadable_discovery.home().join("missing.json"),
        discovery_root: discovery_file,
    };
    assert_eq!(
        serde_json::to_value(get_projects_from(&unreadable_discovery_locations)).unwrap(),
        expected_variant(
            "projects.fail-soft.missing-invalid-unreadable",
            "unreadableDiscovery"
        )
    );
}
