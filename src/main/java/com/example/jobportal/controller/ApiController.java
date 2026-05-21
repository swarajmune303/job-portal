package com.example.jobportal.controller;

import com.example.jobportal.model.Application;
import com.example.jobportal.model.Job;
import com.example.jobportal.model.User;
import com.example.jobportal.service.ApplicationService;
import com.example.jobportal.service.JobService;
import com.example.jobportal.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.io.IOException;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    @Autowired
    private UserService userService;

    @Autowired
    private JobService jobService;

    @Autowired
    private ApplicationService applicationService;

    // --- Auth Endpoints ---
    @PostMapping("/auth/register")
    public ResponseEntity<User> register(@RequestBody User user) {
        return ResponseEntity.ok(userService.registerUser(user));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        User user = userService.loginUser(credentials.get("email"), credentials.get("password"));
        if (user != null) {
            return ResponseEntity.ok(user);
        }
        return ResponseEntity.status(401).body("Invalid credentials");
    }

    // --- Job Endpoints ---
    @GetMapping("/jobs")
    public ResponseEntity<List<Job>> getJobs() {
        return ResponseEntity.ok(jobService.getOpenJobs());
    }

    @PostMapping("/jobs")
    public ResponseEntity<Job> postJob(@RequestBody Job job, @RequestParam Long companyId) {
        User company = userService.getUserById(companyId);
        if (company != null && "COMPANY".equals(company.getRole())) {
            job.setCompany(company);
            return ResponseEntity.ok(jobService.postJob(job));
        }
        return ResponseEntity.badRequest().build();
    }
    
    @GetMapping("/jobs/search")
    public ResponseEntity<List<Job>> searchJobs(@RequestParam String query) {
        return ResponseEntity.ok(jobService.searchJobs(query));
    }
    
    @GetMapping("/jobs/company/{companyId}")
    public ResponseEntity<List<Job>> getCompanyJobs(@PathVariable Long companyId) {
        return ResponseEntity.ok(jobService.getJobsByCompany(companyId));
    }

    // --- Application Endpoints ---
    @PostMapping("/applications")
    public ResponseEntity<Application> apply(@RequestParam Long userId, @RequestParam Long jobId) {
        User user = userService.getUserById(userId);
        Job job = jobService.getJobById(jobId);
        if (user != null && job != null) {
            return ResponseEntity.ok(applicationService.applyForJob(user, job));
        }
        return ResponseEntity.badRequest().build();
    }

    @GetMapping("/applications/user/{userId}")
    public ResponseEntity<List<Application>> getUserApplications(@PathVariable Long userId) {
        return ResponseEntity.ok(applicationService.getApplicationsByUser(userId));
    }

    @GetMapping("/applications/job/{jobId}")
    public ResponseEntity<List<Application>> getJobApplications(@PathVariable Long jobId) {
        return ResponseEntity.ok(applicationService.getApplicationsByJob(jobId));
    }

    @PutMapping("/applications/{id}/status")
    public ResponseEntity<Application> updateApplicationStatus(@PathVariable Long id, @RequestBody Map<String, String> payload) {
        Application app = applicationService.updateApplicationStatus(id, payload.get("status"));
        if (app != null) {
            return ResponseEntity.ok(app);
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/users/seekers/search")
    public ResponseEntity<List<User>> searchSeekers(@RequestParam String query) {
        return ResponseEntity.ok(userService.searchSeekers(query));
    }

    // --- Resume Endpoints ---
    @PostMapping("/users/{id}/resume")
    public ResponseEntity<?> uploadResume(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        try {
            User user = userService.uploadResume(id, file);
            if (user != null) {
                return ResponseEntity.ok("Resume uploaded successfully");
            }
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.status(500).body("Error uploading file");
        }
    }

    @GetMapping("/users/{id}/resume")
    public ResponseEntity<byte[]> getResume(@PathVariable Long id) {
        User user = userService.getUserById(id);
        if (user != null && user.getResumeData() != null) {
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + user.getResumeFilename() + "\"")
                    .contentType(MediaType.parseMediaType(user.getResumeContentType()))
                    .body(user.getResumeData());
        }
        return ResponseEntity.notFound().build();
    }
}
