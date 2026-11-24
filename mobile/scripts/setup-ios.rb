# Wires the WORFIX native iOS parts into ios/App/App.xcodeproj (run once after `npx cap add ios`; safe to re-run):
#  • App target: Native/*.swift, Shared/WorfixShared.swift, App.entitlements, FirebaseMessaging (Swift Package)
#  • WorfixWidgets: widget extension (5 widgets + the walk Live Activity), iOS 16.1+
#  • WorfixShare: share extension (Share → WORFIX)
# Usage (from mobile/): ruby scripts/setup-ios.rb      (needs: gem install xcodeproj)
require "xcodeproj"

ROOT = File.expand_path("../ios/App", __dir__)
project = Xcodeproj::Project.open(File.join(ROOT, "App.xcodeproj"))
app = project.targets.find { |t| t.name == "App" } or abort("no App target")
version = "1.0"
build = "1"

def group_for(project, path, name = nil)
  project.main_group.children.find { |g| g.respond_to?(:path) && g.path == path } || project.main_group.new_group(name || path, path)
end

def add_file(group, target, rel, phase = :sources)
  ref = group.files.find { |f| f.path == rel } || group.new_reference(rel)
  list = phase == :sources ? target.source_build_phase : target.resources_build_phase
  list.add_file_reference(ref, true) unless list.files_references.include?(ref)
  ref
end

# ── App target ──
app_group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == "App" }
native = app_group.children.find { |g| g.respond_to?(:path) && g.path == "Native" } || app_group.new_group("Native", "Native")
Dir[File.join(ROOT, "App/Native/*.swift")].sort.each { |f| add_file(native, app, File.basename(f)) }
shared = group_for(project, "Shared")
shared_ref = shared.files.find { |f| f.path == "WorfixShared.swift" } || shared.new_reference("WorfixShared.swift")
app.source_build_phase.add_file_reference(shared_ref, true) unless app.source_build_phase.files_references.include?(shared_ref)
app_group.files.find { |f| f.path == "App.entitlements" } || app_group.new_reference("App.entitlements")
app.build_configurations.each do |c|
  c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
  c.build_settings["MARKETING_VERSION"] = version
  c.build_settings["CURRENT_PROJECT_VERSION"] = build
  c.build_settings["TARGETED_DEVICE_FAMILY"] = "1,2"
end

# FirebaseMessaging via Swift Package Manager (push: FCM token on iOS, like Android)
pkg = project.root_object.package_references.find { |p| p.respond_to?(:repositoryURL) && p.repositoryURL.include?("firebase-ios-sdk") }
unless pkg
  pkg = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  pkg.repositoryURL = "https://github.com/firebase/firebase-ios-sdk"
  pkg.requirement = { "kind" => "upToNextMajorVersion", "minimumVersion" => "13.0.0" }
  project.root_object.package_references << pkg
end
unless app.package_product_dependencies.any? { |d| d.product_name == "FirebaseMessaging" }
  dep = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dep.package = pkg
  dep.product_name = "FirebaseMessaging"
  app.package_product_dependencies << dep
  bf = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  bf.product_ref = dep
  app.frameworks_build_phase.files << bf
end

# ── extensions ──
def extension(project, app, name, bundle_id, deployment, sources, resources, version, build)
  target = project.targets.find { |t| t.name == name }
  unless target
    target = project.new_target(:app_extension, name, :ios, deployment, nil, :swift)
    app.add_dependency(target)
  end
  group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == name } || project.main_group.new_group(name, name)
  sources.each { |s| add_file(group, target, s) }
  resources.each { |r| add_file(group, target, r, :resources) }
  %w[Info.plist].each { |f| group.files.find { |x| x.path == f } || group.new_reference(f) }
  group.files.find { |x| x.path == "#{name}.entitlements" } || group.new_reference("#{name}.entitlements")
  shared_ref = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == "Shared" }.files.find { |f| f.path == "WorfixShared.swift" }
  target.source_build_phase.add_file_reference(shared_ref, true) unless target.source_build_phase.files_references.include?(shared_ref)
  target.build_configurations.each do |c|
    s = c.build_settings
    s["PRODUCT_BUNDLE_IDENTIFIER"] = bundle_id
    s["PRODUCT_NAME"] = "$(TARGET_NAME)"
    s["INFOPLIST_FILE"] = "#{name}/Info.plist"
    s["GENERATE_INFOPLIST_FILE"] = "NO"
    s["CODE_SIGN_ENTITLEMENTS"] = "#{name}/#{name}.entitlements"
    s["CODE_SIGN_STYLE"] = "Automatic"
    s["IPHONEOS_DEPLOYMENT_TARGET"] = deployment
    s["SWIFT_VERSION"] = "5.0"
    s["TARGETED_DEVICE_FAMILY"] = "1,2"
    s["MARKETING_VERSION"] = version
    s["CURRENT_PROJECT_VERSION"] = build
    s["SKIP_INSTALL"] = "YES"
    s["APPLICATION_EXTENSION_API_ONLY"] = "YES"
    s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
    s["ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME"] = "AccentColor" if resources.any? { |r| r.end_with?(".xcassets") }
  end
  target
end

widgets = extension(project, app, "WorfixWidgets", "site.worfix.app.widgets", "16.1",
                    ["WorfixWidgets.swift", "WalkLiveActivity.swift"], ["Assets.xcassets"], version, build)
share = extension(project, app, "WorfixShare", "site.worfix.app.share", "15.0",
                  ["ShareViewController.swift"], [], version, build)

# Embed both extensions in the app
embed = app.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } || app.new_copy_files_build_phase("Embed Foundation Extensions")
embed.dst_subfolder_spec = "13" # PlugIns
[widgets, share].each do |t|
  next if embed.files_references.include?(t.product_reference)
  bf = embed.add_file_reference(t.product_reference, true)
  bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

project.save
puts "App.xcodeproj: App + WorfixWidgets + WorfixShare wired"
