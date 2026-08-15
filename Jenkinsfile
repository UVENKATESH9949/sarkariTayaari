// SarkariTaiyaari CI — builds all three pieces of the monorepo and publishes an APK.
//
// Assumes a Linux agent. If your agent is Windows, swap every `sh` for `bat` and
// `./gradlew` for `gradlew.bat` — nothing else changes.
//
// Agent prerequisites (the pipeline checks these up front rather than failing
// halfway through with a confusing error):
//   - JDK 21          — backend targets Java 21
//   - Node 20+        — Expo SDK 57 / Vite 8
//   - Android SDK     — with ANDROID_HOME set, for the APK stage
//   - Maven           — or use the Maven wrapper if you add one
//
// Jenkins credentials referenced (create these as "Secret text" unless noted):
//   neon-db-url, neon-db-username, neon-db-password  — only needed if you enable
//                                                      the backend test stage
//
// Note on backend tests: they run against the real Neon dev database and clean up
// after themselves. Two concurrent builds would collide, so they are OFF by default.
// Point them at a dedicated CI database before turning them on.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
  }

  parameters {
    string(
      name: 'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:8080/api',
      description: 'Backend URL baked into the APK. A standalone build has no Metro host to infer it from, so this must be reachable from the device. 10.0.2.2 is the host machine as seen from an Android emulator; use a LAN IP or a real domain for physical devices.'
    )
    booleanParam(
      name: 'RUN_BACKEND_TESTS',
      defaultValue: false,
      description: 'Run the backend integration suite. Requires a real database — see the note at the top of this file.'
    )
    booleanParam(
      name: 'BUILD_APK',
      defaultValue: true,
      description: 'Build the Android APK. Turn off for a faster check when only the backend or admin changed.'
    )
  }

  environment {
    // Consumed by mobile/src/api/config.ts at bundle time. EXPO_PUBLIC_ variables are
    // inlined into the JS bundle, so this is fixed at build time, not runtime.
    EXPO_PUBLIC_API_BASE_URL = "${params.API_BASE_URL}"
  }

  stages {

    stage('Preflight') {
      steps {
        sh '''
          set -e
          echo "--- toolchain ---"
          java -version
          node --version
          npm --version
          mvn --version | head -1
          if [ "${BUILD_APK}" = "true" ]; then
            : "${ANDROID_HOME:?ANDROID_HOME is not set — required for the APK stage}"
            echo "ANDROID_HOME=$ANDROID_HOME"
          fi
        '''
      }
    }

    stage('Backend — build') {
      steps {
        // Tests are handled separately below, so they are skipped here regardless.
        sh 'mvn -B -f backend/pom.xml -DskipTests clean package'
      }
      post {
        success {
          archiveArtifacts artifacts: 'backend/target/*.jar', fingerprint: true
        }
      }
    }

    stage('Backend — tests') {
      when { expression { return params.RUN_BACKEND_TESTS } }
      environment {
        DB_URL      = credentials('neon-db-url')
        DB_USERNAME = credentials('neon-db-username')
        DB_PASSWORD = credentials('neon-db-password')
      }
      steps {
        // application-local.yml is gitignored precisely so credentials never live in
        // the repo; CI materialises it from Jenkins credentials instead.
        sh '''
          set -e
          cat > backend/application-local.yml <<EOF
spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
EOF
          mvn -B -f backend/pom.xml test
        '''
      }
      post {
        always {
          junit testResults: 'backend/target/surefire-reports/*.xml', allowEmptyResults: true
          // Remove it even if the stage failed — never leave credentials on the agent.
          sh 'rm -f backend/application-local.yml'
        }
      }
    }

    stage('Admin — lint & build') {
      steps {
        sh '''
          set -e
          cd admin
          npm ci
          npm run lint
          npm run build
        '''
      }
      post {
        success {
          archiveArtifacts artifacts: 'admin/dist/**', fingerprint: true
        }
      }
    }

    stage('Mobile — typecheck') {
      steps {
        sh '''
          set -e
          cd mobile
          npm ci
          npx tsc --noEmit
        '''
      }
    }

    stage('Mobile — APK') {
      when { expression { return params.BUILD_APK } }
      steps {
        // android/ is not committed (Continuous Native Generation): app.json is the
        // source of truth and the native project is regenerated from it every build.
        sh '''
          set -e
          cd mobile
          npx expo prebuild --platform android --no-install --clean
          cd android
          chmod +x ./gradlew
          ./gradlew assembleRelease --no-daemon
        '''
      }
      post {
        success {
          archiveArtifacts artifacts: 'mobile/android/app/build/outputs/apk/release/*.apk', fingerprint: true
        }
      }
    }
  }

  post {
    always {
      // node_modules and the generated native project make the workspace large and
      // are fully reproducible, so there is nothing worth keeping between builds.
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}
