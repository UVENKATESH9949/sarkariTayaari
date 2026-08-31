# Stage 1: build the jar.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# One resolution pass, not two.
#
# This used to `COPY pom.xml` then `RUN mvn dependency:go-offline` before copying src, the
# standard trick for caching dependencies in a Docker layer. That buys nothing here: Cloud
# Build starts every build from a cold daemon with no layer cache, so the "cached" layer is
# rebuilt every time. What it did add was a second full dependency resolution and a
# dependency on `dependency:go-offline`, a goal well known for failing on plugin resolution
# in ways `package` does not.
#
# Tests are skipped on purpose: several hit the real Neon database, whose credentials do not
# exist in a build context. They run in local dev and in the backend test suite instead.
RUN mvn -B package -DskipTests

# Stage 2: small runtime image, just the jar.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
