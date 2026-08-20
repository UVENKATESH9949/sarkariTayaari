# Stage 1: build the jar. Tests are skipped here on purpose — several tests
# (e.g. LiveQuestionsTest) hit the real Neon database, which has no
# credentials available inside a Cloud Build/Docker build context. Tests
# still run normally in local dev and CI where application-local.yml exists.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

# Stage 2: small runtime image, just the jar.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
