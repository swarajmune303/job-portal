package com.example.jobportal.service;

import com.example.jobportal.model.User;
import com.example.jobportal.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public User registerUser(User user) {
        // Simple registration without password hashing for simplicity, 
        // in production we should use BCrypt.
        return userRepository.save(user);
    }

    public User loginUser(String email, String password) {
        Optional<User> user = userRepository.findByEmail(email);
        if (user.isPresent() && user.get().getPassword().equals(password)) {
            return user.get();
        }
        return null;
    }

    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }
    
    public java.util.List<User> searchSeekers(String query) {
        if (query == null || query.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        return userRepository.findByRoleAndNameContainingIgnoreCaseOrRoleAndSkillsContainingIgnoreCase("SEEKER", query, "SEEKER", query);
    }

    public User uploadResume(Long userId, MultipartFile file) throws IOException {
        User user = getUserById(userId);
        if (user != null) {
            user.setResumeData(file.getBytes());
            user.setResumeContentType(file.getContentType());
            user.setResumeFilename(file.getOriginalFilename());
            return userRepository.save(user);
        }
        return null;
    }
}
